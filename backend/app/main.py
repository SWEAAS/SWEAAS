"""FastAPI entrypoint."""

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for SWEAAS.",
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", tags=["root"])
def get_root() -> dict[str, str]:
    return {
        "message": "SWEAAS backend is running.",
        "docs_url": "/docs",
        "api_base": settings.api_prefix,
    }
