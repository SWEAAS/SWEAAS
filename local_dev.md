# Local Development Guide

Every developer runs their own local stack. No shared backend, no tunnels — just `docker compose up`.

## Prerequisites

- **Docker** and **Docker Compose** (v2) — [Install Docker Desktop](https://docs.docker.com/get-docker/)
- A copy of `.env` at the repo root (see setup below)

## Supabase CLI (linking this repo to your hosted project)

The repo includes `supabase/` from `supabase init` (local CLI config). **Linking** ties it to your cloud project; it requires **your** Supabase account — run these on your machine, not in CI, unless you use a token.

1. Install the CLI: `brew install supabase/tap/supabase` (or see [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)).
2. Authenticate **one** of these ways:
   - **Browser:** `supabase login`
   - **Token:** create a [personal access token](https://supabase.com/dashboard/account/tokens), then either export `SUPABASE_ACCESS_TOKEN=...` for the session or add it to `.env` (same name) and run `set -a && source .env && set +a` before the next step.
3. From the repo root:

```bash
supabase link --project-ref bzsxqzgryiemyzeeefuw
```

You may be prompted for the **database password** (Settings → Database). After linking, use `supabase db pull` / migrations as needed.

Fill **app** env vars from [Project Settings → API](https://supabase.com/dashboard/project/bzsxqzgryiemyzeeefuw/settings/api): **`SUPABASE_URL`**, **`SUPABASE_PUBLISHABLE_KEY`**, **`SUPABASE_SECRET_KEY`**. User access tokens are verified with **JWKS** (ES256/RS256 from Supabase JWT Signing Keys), not a shared HS256 secret.

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
# LLM for LangGraph agents — pick one provider:
OPENAI_API_KEY=sk-...        # Default when LLM_DEFAULT_MODEL is OpenAI (e.g. gpt-4o-mini)
# Or use Grok (set LLM_DEFAULT_MODEL=xai/grok-2 — xAI uses OpenAI-compatible API):
XAI_API_KEY=xai-...
LLM_DEFAULT_MODEL=xai/grok-2

SUPABASE_URL=https://<ref>.supabase.co   # Required when AUTH_ENFORCE_JWT=true (JWKS)
```

All other API keys (Stripe, Sentry, E2B, etc.) are optional — features that
depend on them will return stubs or errors until configured.

### JWT enforcement and CORS

When you point a production web app at this backend, set:

```
AUTH_ENFORCE_JWT=true
SUPABASE_URL=https://<ref>.supabase.co
```

With `AUTH_ENFORCE_JWT=true`, the process **refuses to start** if `SUPABASE_URL` is empty (JWKS verification). Almost all `/api/v1` routes require a valid Supabase access token (`Authorization: Bearer <jwt>`). These stay public without a user JWT: `GET /api/v1/health`, Stripe `POST /api/v1/budget/webhook`, and feedback provider webhooks under `/api/v1/feedback/webhooks/*`. OpenAPI `/docs`, `/redoc`, and `/openapi.json` are **disabled** while enforcement is on.

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

## Stripe webhooks (local dev)

Stripe cannot POST to `localhost`. Use the **Stripe CLI** to forward test webhooks to the backend.

1. Install and log in: [Stripe CLI](https://stripe.com/docs/stripe-cli) → `stripe login`.
2. Start the API on port **8000** (`docker compose up` or local `uvicorn`).
3. In a separate terminal, from anywhere:

```bash
stripe listen --forward-to localhost:8000/api/v1/budget/webhook
```

4. The CLI prints **`Ready! ... Your webhook signing secret is whsec_...`**. Copy that value into **`.env`** as **`STRIPE_WEBHOOK_SECRET`** (test mode only). **Each new `stripe listen` run may print a different secret** — update `.env` if you restart the CLI.
5. Trigger a test event (with `listen` still running):

```bash
stripe trigger checkout.session.completed
```

6. The backend should respond **200** with a body like `{"message":"ok:checkout.session.completed"}` when verification succeeds.

If `STRIPE_WEBHOOK_SECRET` is unset or still the placeholder `whsec_your-webhook-secret`, the handler accepts webhooks **without** verifying signatures (convenient but insecure — use only for quick checks).

**Stripe CLI vs `.env`:** `stripe listen` / `stripe trigger` use the account from `stripe login`. Your app uses **`STRIPE_SECRET_KEY` in `.env`**. Both should be the same Stripe account (compare the middle segment of the Test secret key, e.g. `sk_test_51THF2mK0YOQL06qe…`, with `stripe config --list`).

**Docker + Stripe keys:** Compose injects `.env` when the **backend container is created**. If you change `STRIPE_*` in `.env` but still see `Invalid API Key` or placeholder values inside the container, recreate the backend: `docker compose up -d --force-recreate backend`.

## Deploying to AWS

All production infrastructure runs on **AWS** (account `802528391167`, `us-east-1`). IaC is in [`infra/`](infra/) (CDK TypeScript).

### Frontend (Amplify Hosting)

- App ID: `d3rw7tzkg9y12a` | Domain: **sweaas.com**
- Build locally: `cd frontend && VITE_API_BASE_URL=https://api.sweaas.com/api/v1 npm run build`
- Deploy via Amplify console or CLI (see [`frontend/README.md`](frontend/README.md))

### Backend (ECS Fargate + ALB)

- Docker image in ECR: `802528391167.dkr.ecr.us-east-1.amazonaws.com/sweaas-backend`
- Build and push: `docker build --platform linux/amd64 -t sweaas-backend -f backend/Dockerfile . && docker tag sweaas-backend:latest <ecr-uri>:latest && docker push <ecr-uri>:latest`
- Update ECS: `aws ecs update-service --cluster sweaas --service backend --force-new-deployment`
- CI/CD: Push to `main` (backend paths) triggers [`.github/workflows/deploy-aws.yml`](.github/workflows/deploy-aws.yml)

### Infrastructure changes

```bash
cd infra
npx cdk diff    # preview
npx cdk deploy  # apply
```

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
