# SWEAAS backend (`backend/`)

Python **FastAPI** application packaged as `sweaas-backend` (see root [`pyproject.toml`](../pyproject.toml)). Import path is `app` with `PYTHONPATH=backend` or `pip install -e .` from the repo root.

## Layout

```
backend/
├── alembic.ini          # Alembic config (run from repo root: cd backend && alembic …)
├── alembic/             # env.py + migration versions
└── app/
    ├── main.py          # FastAPI app, CORS, Sentry, router mount
    ├── api/
    │   ├── router.py    # Single place to register all route modules
    │   ├── middleware/  # Supabase JWT auth
    │   └── routes/      # One file per domain (agents, budget, feedback, …)
    ├── core/            # Settings, async DB engine, dependencies
    ├── models/          # SQLAlchemy ORM (Postgres)
    ├── schemas/         # Pydantic request/response models
    ├── services/        # Business logic (no HTTP)
    └── agents/          # LangGraph nodes, tools, role prompts
└── tests/               # Pytest (see tests/README.md)
```

## Run locally

From **repository root**:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
docker compose up -d
cd backend && alembic upgrade head && cd ..
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend
```

Or `cd backend` and set `PYTHONPATH=.` if your tooling expects that.

- **Swagger:** http://localhost:8000/docs  
- **OpenAPI JSON:** http://localhost:8000/openapi.json  

## Customer experience (product users)

| Concern | API | Notes |
|--------|-----|--------|
| **Chat with end users** | `POST /api/v1/agents/sup-cs-01/chat` | Customer Support agent (`seed_data.py`) |
| **Customer video call** | `POST /api/v1/communication/customer-call` | Tavus; optional `TAVUS_CUSTOMER_*` persona/replica |
| **Owner / internal CTO video** | `POST /api/v1/communication/cto-call` | Separate Tavus persona |
| **User feedback** | `POST /api/v1/feedback`, `GET /api/v1/feedback` | Optional `FEEDBACK_WEBHOOK_URL` fan-out |
| **Intercom / Canny ingest** | `POST /api/v1/feedback/webhooks/intercom`, `.../canny` | Normalize external tickets into same store |

## Adding a feature (checklist)

1. `app/schemas/<domain>_schema.py` — request/response models  
2. `app/services/<domain>_service.py` — logic  
3. `app/api/routes/<domain>_router.py` — HTTP handlers  
4. `app/api/router.py` — `include_router`  
5. `app/core/dependencies.py` — `get_*_service` factory if needed  
6. `app/core/config.py` + root `.env.example` — new secrets  
7. `tests/test_api/` or `tests/test_services/` — coverage  

## Tests

```bash
pytest backend/tests -q
```

See [`tests/README.md`](tests/README.md).

## Alembic

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

Ensure `app.models` is imported in `alembic/env.py` so autogenerate sees tables.

## Further reading

- [`docs/PROMPTS_AND_AI.md`](../docs/PROMPTS_AND_AI.md) — prompt templates for AI-assisted development  
- [`app/README.md`](app/README.md) — package-oriented map of `app/`
