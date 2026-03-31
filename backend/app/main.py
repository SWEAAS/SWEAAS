"""FastAPI entrypoint with Sentry integration and CORS middleware."""

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

# ── Sentry ───────────────────────────────────────────────────────
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.2 if settings.environment == "production" else 1.0,
        environment=settings.environment,
    )

# ── App ──────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for SWEAAS — SWE as a Service.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://app.sweaas.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", tags=["root"])
def get_root() -> dict[str, str]:
    return {
        "message": "SWEAAS backend is running.",
        "docs_url": "/docs",
        "api_base": settings.api_prefix,
    }
