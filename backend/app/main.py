"""FastAPI entrypoint with Sentry integration and CORS middleware."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware.auth_enforcement import AuthEnforcementMiddleware
from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import async_session_factory as AsyncSessionLocal
logger = logging.getLogger(__name__)
try:
    import sentry_sdk
except ImportError:  # pragma: no cover - optional in local dev/test environments
    sentry_sdk = None



settings = get_settings()

if settings.auth_enforce_jwt and not settings.supabase_url.strip():
    raise RuntimeError(
        "AUTH_ENFORCE_JWT=true requires SUPABASE_URL (JWKS verification)"
    )

# ── Sentry ───────────────────────────────────────────────────────
if sentry_sdk is not None and settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.2 if settings.environment == "production" else 1.0,
        environment=settings.environment,
    )

_expose_docs = not settings.auth_enforce_jwt


async def _ensure_dev_user() -> None:
    """In dev mode (AUTH_ENFORCE_JWT=false), guarantee a dev org + user row exist
    so that project endpoints don't 400 with 'not associated with an organization'."""
    if settings.auth_enforce_jwt:
        return
    import uuid
    from sqlalchemy import select
    from app.core.database import async_session_factory
    from app.models.user import Organization, User

    try:
        async with async_session_factory() as session:
            result = await session.execute(
                select(User).where(User.supabase_uid == "dev-user")
            )
            existing_user = result.scalar_one_or_none()
            if existing_user is not None:
                # Only fill in defaults on fields the operator hasn't set —
                # do NOT overwrite a manually-updated email (or role) on every
                # backend restart. Previously this clobbered custom dev emails.
                if not existing_user.email:
                    existing_user.email = "user@sweaas.dev"
                if not existing_user.full_name:
                    existing_user.full_name = "Dev User"
                if not existing_user.role:
                    existing_user.role = "owner"
                await session.commit()
                return

            org = Organization(name="SWEAAS Dev", slug="sweaas-dev")
            session.add(org)
            await session.flush()

            user = User(
                id=uuid.uuid4(),
                supabase_uid="dev-user",
                email="user@sweaas.dev",
                full_name="Dev User",
                organization_id=org.id,
                role="owner",
            )
            session.add(user)
            await session.commit()
            logger.info("Dev org + user seeded (id=%s)", user.id)
    except Exception:
        logger.warning("Could not seed dev user — DB may not be ready yet", exc_info=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.core.llm_budget import budget_tracker
    from app.models.agent import AgentConfig
    from sqlalchemy import select

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AgentConfig))
        db_agents = result.scalars().all()
        agent_dicts = [
            {
                "agent_id": str(a.id),
                "name": a.name,
                "daily_token_budget": a.daily_token_budget,
                "strike_count": a.strike_count,
            }
            for a in db_agents
        ]
    budget_tracker.init_budgets(agent_dicts)
    logger.info("Budget tracker ready — %d agents loaded from database", len(agent_dicts))
    await _ensure_dev_user()

    # Start the budget-based scheduler
    try:
        from app.services.scheduler_service import scheduler_service
        await scheduler_service.start()
    except Exception:
        logger.warning("Scheduler startup skipped", exc_info=True)

    yield

    # Shutdown scheduler
    try:
        from app.services.scheduler_service import scheduler_service
        await scheduler_service.stop()
    except Exception:
        pass


# ── App ──────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for SWEAAS — SWE as a Service.",
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
    lifespan=lifespan,
)

app.add_middleware(AuthEnforcementMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", tags=["root"])
def get_root() -> dict[str, str]:
    out: dict[str, str] = {
        "message": "SWEAAS backend is running.",
        "api_base": settings.api_prefix,
    }
    if _expose_docs:
        out["docs_url"] = "/docs"
    return out
