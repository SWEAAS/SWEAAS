"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root is three levels above this file: backend/app/core/config.py
_REPO_ROOT = Path(__file__).resolve().parents[3]
# Prefer root .env (has all real secrets); fall back to backend/.env for Docker
_ENV_FILE = str(_REPO_ROOT / ".env") if (_REPO_ROOT / ".env").exists() else ".env"


class Settings(BaseSettings):
    """Runtime settings — populated from env vars or .env file."""

    model_config = {"env_file": _ENV_FILE, "env_file_encoding": "utf-8", "extra": "ignore"}

    # Application
    app_name: str = "SWEAAS Backend"
    app_version: str = "0.1.0"
    api_prefix: str = "/api/v1"
    environment: str = "development"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:3000,http://127.0.0.1:3000,https://app.sweaas.dev"
    )
    auth_enforce_jwt: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://sweaas:sweaas@localhost:5432/sweaas"
    database_pool_size: int = 20

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Supabase: publishable + secret (API Keys); user JWTs via JWKS using SUPABASE_URL
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""

    # GitHub App
    github_app_id: str = ""
    github_client_id: str = ""
    github_app_private_key_path: str = ""
    github_org_name: str = "SWEAAS"
    github_webhook_secret: str = ""
    github_webhook_proxy_url: str = ""

    # LLM — direct provider calls via OpenAI / Anthropic SDKs
    # Model format: xai/grok-3, gpt-4o-mini, claude-3-5-haiku-20241022, etc.
    llm_default_model: str = "gpt-4o-mini"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    xai_api_key: str = ""

    # E2B
    e2b_api_key: str = ""

    # Sentry (platform monitoring + per-project provisioning)
    sentry_dsn: str = ""
    sentry_auth_token: str = ""
    sentry_org: str = ""
    sentry_project: str = "sweaas"
    sentry_team: str = ""

    # Stripe
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""

    # AgentMail
    agentmail_api_key: str = ""

    # Tavus (CTO + customer-facing video; customer IDs optional — fallback to CTO)
    tavus_api_key: str = ""
    tavus_replica_id: str = ""
    tavus_persona_id: str = ""
    tavus_customer_replica_id: str = ""
    tavus_customer_persona_id: str = ""

    # User feedback fan-out (Slack, Zapier, or internal worker)
    feedback_webhook_url: str = ""

    # Optional: voice/SMS for human escalation (future Twilio integration)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # Golpo
    golpo_api_key: str = ""

    # Greptile (AI code review + semantic code queries)
    greptile_api_key: str = ""

    # ChromaDB
    chroma_host: str = "localhost"
    chroma_port: int = 8100

    # LangSmith
    langchain_tracing_v2: bool = False
    langchain_api_key: str = ""
    langchain_project: str = "sweaas"


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
