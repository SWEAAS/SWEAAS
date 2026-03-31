"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime settings — populated from env vars or .env file."""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

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

    # Supabase Auth
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # GitHub App
    github_app_id: str = ""
    github_app_private_key_path: str = ""
    github_org_name: str = "SWEAAS"
    github_webhook_secret: str = ""

    # LiteLLM
    litellm_master_key: str = ""
    litellm_api_base: str = "http://localhost:4000"
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    # E2B
    e2b_api_key: str = ""

    # Sentry
    sentry_dsn: str = ""
    sentry_auth_token: str = ""
    sentry_org: str = ""
    sentry_project: str = "sweaas"

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
