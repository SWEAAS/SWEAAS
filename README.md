# SWEAAS Backend

FastAPI backend scaffold for SWEAAS. The API is organized by domain so frontend and infrastructure work can evolve independently around stable contracts.

## Structure

- `backend/app/api`: API routers and versioned route composition
- `backend/app/core`: configuration and dependency wiring
- `backend/app/schemas`: request and response models
- `backend/app/services`: domain logic and in-memory seed data
- `backend/tests`: smoke tests for the initial API surface

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --app-dir backend --reload
```

## Initial domains

- Health
- Agents
- Budget tracking
- Onboarding
- Communication
- Observability
