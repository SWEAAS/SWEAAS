"""Application configuration."""

from functools import lru_cache
from os import getenv

from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Runtime settings for the API."""

    app_name: str = Field(default=getenv("APP_NAME", "SWEAAS Backend"))
    app_version: str = Field(default=getenv("APP_VERSION", "0.1.0"))
    api_prefix: str = Field(default=getenv("API_PREFIX", "/api/v1"))
    environment: str = Field(default=getenv("ENVIRONMENT", "development"))


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""

    return Settings()
