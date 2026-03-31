# Local Development Guide

Every developer runs their own local stack. No shared backend, no tunnels — just `docker compose up`.

## Prerequisites

- **Docker** and **Docker Compose** (v2) — [Install Docker Desktop](https://docs.docker.com/get-docker/)
- A copy of `.env` at the repo root (see setup below)

## Quick Start

```bash
# 1. Create your .env from the template
cp .env.example .env
# Edit .env and fill in your API keys (OpenAI, Stripe, etc.)

# 2. Build and start all services
docker compose up --build
```

Once running:

| Service    | URL                          | Notes                              |
| ---------- | ---------------------------- | ---------------------------------- |
| Frontend   | http://localhost:3000         | Nginx serving built React app      |
| Backend    | http://localhost:8000         | FastAPI (`/docs` when `AUTH_ENFORCE_JWT=false`) |
| PostgreSQL | localhost:5432               | User/pass from `POSTGRES_*` in .env |
| Redis      | localhost:6379               | Reserved for future use (not wired in app code yet) |
| ChromaDB   | http://localhost:8100         | Vector store REST API              |

## Environment Variables

All configuration lives in a **single `.env` file** at the repo root. This file feeds:

- **docker-compose.yml** — Postgres credentials via `${POSTGRES_*}` interpolation
- **Backend container** — all settings via `env_file: .env` (Pydantic Settings reads them automatically)
- **Frontend build** — `VITE_API_BASE_URL` is baked in at build time (default `/api/v1` works locally)

When running inside Docker, the compose file overrides infrastructure hostnames
(`DATABASE_URL`, `REDIS_URL`, `CHROMA_HOST`) to point at Docker service names
instead of `localhost`. You do not need to change these manually.

### Key variables to fill in

At minimum, set these for a functional local stack:

```
OPENAI_API_KEY=sk-...        # Required for agent LLM calls
SUPABASE_JWT_SECRET=...      # Required when AUTH_ENFORCE_JWT=true
```

All other API keys (Stripe, Sentry, E2B, etc.) are optional — features that
depend on them will return stubs or errors until configured.

### JWT enforcement and CORS

When you point a production web app at this backend, set:

```
AUTH_ENFORCE_JWT=true
SUPABASE_JWT_SECRET=<your Supabase JWT signing secret>
```

With `AUTH_ENFORCE_JWT=true`, the process **refuses to start** if `SUPABASE_JWT_SECRET` is empty. Almost all `/api/v1` routes require a valid Supabase access token (`Authorization: Bearer <jwt>`). These stay public without a user JWT: `GET /api/v1/health`, Stripe `POST /api/v1/budget/webhook`, and feedback provider webhooks under `/api/v1/feedback/webhooks/*`. OpenAPI `/docs`, `/redoc`, and `/openapi.json` are **disabled** while enforcement is on.

List every browser origin that should call the API in **`CORS_ORIGINS`** (comma-separated), for example local dev and your deployed frontend URL.

## Running Without Docker (bare-metal dev)

If you prefer running services directly for faster iteration:

```bash
# 1. Start only the infrastructure containers
docker compose up postgres redis chromadb -d

# 2. Backend (from repo root, with a Python 3.11+ venv)
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev    # Vite dev server on http://localhost:5173
```

In this mode, the Vite dev server proxies `/api` to `localhost:8000` automatically.

## Database Migrations

```bash
# Run from repo root with backend on your PYTHONPATH
cd backend
alembic upgrade head
```

Inside Docker, you can exec into the backend container:

```bash
docker compose exec backend alembic upgrade head
```

## Rebuilding

```bash
# Rebuild a single service after code changes
docker compose build backend
docker compose up backend -d

# Full rebuild
docker compose up --build

# Nuclear option — remove volumes and rebuild
docker compose down -v
docker compose up --build
```

## Deploying the frontend (Firebase Hosting on GCP)

**Google Cloud project:** `sweass`. The static Vite app deploys with **Firebase Hosting**; config is [`firebase.json`](firebase.json) (build output: `frontend/dist`). SPA rewrites are defined there.

The FastAPI backend is **not** served by Firebase — deploy it separately (Cloud Run, Render, etc.) when ready.

1. Enable **Firebase Hosting** in the [Firebase console](https://console.firebase.google.com/) for project `sweass`.
2. Configure GitHub secrets **`FIREBASE_SERVICE_ACCOUNT_SWEAAS`** and **`VITE_API_BASE_URL`** (see [`frontend/README.md`](frontend/README.md)).
3. Push to **`main`** to run [`.github/workflows/deploy-firebase-hosting.yml`](.github/workflows/deploy-firebase-hosting.yml), or deploy manually: `cd frontend && npm ci && npm run build && cd .. && firebase deploy --only hosting --project sweass` (with `VITE_API_BASE_URL` set for the build).
4. Add your Hosting URLs to backend **`CORS_ORIGINS`** (e.g. `https://sweass.web.app`).

## Deploying the backend

The API is a normal Docker image ([`backend/Dockerfile`](backend/Dockerfile)). On Google Cloud, **Cloud Run** is the natural fit for the same GCP project. Other options: Render, Fly.io, Railway. Use managed Postgres/Redis or containers.

## Troubleshooting

**Backend fails to connect to Postgres**
- Ensure the `postgres` container is healthy: `docker compose ps`
- Check that `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` in `.env`
  match what the database was initialized with (volumes persist old credentials)
- If credentials changed, remove the volume: `docker compose down -v`

**Frontend shows a blank page or API errors**
- Open browser dev tools Network tab and check API requests
- Ensure the backend is running: `curl http://localhost:8000/`
- If running bare-metal frontend, verify the Vite proxy is active (port 5173)

**Port conflicts**
- If 5432, 6379, 8000, 8100, or 3000 are in use, stop the conflicting process
  or change the host-side port in `docker-compose.yml` (e.g. `"5433:5432"`)
