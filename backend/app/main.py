"""FastAPI entrypoint with Sentry integration and CORS middleware."""

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware.auth_enforcement import AuthEnforcementMiddleware
from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

if settings.auth_enforce_jwt and not settings.supabase_jwt_secret.strip():
    raise RuntimeError("AUTH_ENFORCE_JWT=true requires a non-empty SUPABASE_JWT_SECRET")

# ── Sentry ───────────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.2 if settings.environment == "production" else 1.0,
        environment=settings.environment,
    )

_expose_docs = not settings.auth_enforce_jwt

# ── App ──────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for SWEAAS — SWE as a Service.",
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
)

# Auth runs after CORS (CORS is added last → runs first on incoming requests).
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
