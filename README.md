# SWEAAS — SWE as a Service

A platform that gives anyone access to a ready-to-go AI-powered software engineering team.
Solo founders and small teams get a full engineering department — CTO, managers, and specialist agents — that autonomously plans, builds, tests, and ships code within a user-defined budget.

### Documentation map (read these with every AI prompt)

| Doc | Use |
|-----|-----|
| **This file** | Architecture, APIs, integrations, quick start |
| [`docs/PROMPTS_AND_AI.md`](docs/PROMPTS_AND_AI.md) | Cursor / LLM prompt templates, file pointers, conventions |
| [`docs/README.md`](docs/README.md) | Index of all docs |
| [`backend/README.md`](backend/README.md) | Python layout, tests, Alembic, customer-facing API table |
| [`backend/app/README.md`](backend/app/README.md) | `app/` package layers and rules |
| [`backend/tests/README.md`](backend/tests/README.md) | Pytest how-to |
| [`frontend/README.md`](frontend/README.md) | Vite app structure, theme, Firebase Hosting + CI |

Product vision (not auto-loaded by code): [`prompt.md`](prompt.md), [`plan.md`](plan.md).

---

## Customer experience: chat, calls, and feedback

**Product users** (your customers) are **not** the same as platform owners. Use dedicated APIs so support traffic stays isolated from internal engineering agents.

| Capability | How |
|------------|-----|
| **Chat with product users** | `POST /api/v1/agents/sup-cs-01/chat` — **Customer Support** agent (`sup-cs-01`). Same chat machinery as other agents; wire your in-app widget to this ID. |
| **Customer video / voice-style call** | `POST /api/v1/communication/customer-call` — Tavus CVI for end users. Set `TAVUS_CUSTOMER_REPLICA_ID` and `TAVUS_CUSTOMER_PERSONA_ID` (optional; falls back to CTO replica in dev). |
| **Owner / CTO strategy call** | `POST /api/v1/communication/cto-call` — internal Tavus persona. |
| **User feedback (triage → agents)** | `POST /api/v1/feedback` (authenticated), `GET /api/v1/feedback?project_id=…`. Optional fan-out: `FEEDBACK_WEBHOOK_URL` (Slack, Zapier, worker). |
| **External tools** | `POST /api/v1/feedback/webhooks/intercom` and `.../webhooks/canny` normalize tickets into the same feedback store for agents to consume. |

**Support department in the agent roster:** `Customer Success Manager` (`sup-mgr-01`) and **Customer Support** (`sup-cs-01`) in [`backend/app/services/seed_data.py`](backend/app/services/seed_data.py).  
**Optional future:** Twilio voice/SMS (`TWILIO_*` in `.env.example`) for human escalation — hooks reserved in config.

---

## Cloud (this repo)

- **AWS** (account `802528391167`, region `us-east-1`):
  - **Frontend:** AWS Amplify Hosting at **sweaas.com** (app ID `d3rw7tzkg9y12a`). SPA rewrite, auto-SSL, CDN.
  - **Backend:** FastAPI on ECS Fargate behind ALB at **api.sweaas.com**. Docker image in ECR (`sweaas-backend`).
  - **Database:** RDS PostgreSQL 16 (db.t4g.micro) with pgvector extension.
  - **Redis:** ElastiCache (cache.t3.micro).
  - **ChromaDB:** ECS Fargate with Cloud Map service discovery (`chromadb.sweaas.local`).
  - **DNS:** Route 53 hosted zone for `sweaas.com`. Namecheap NS records point to Route 53.
  - **Secrets:** AWS Secrets Manager (`sweaas/app-secrets`, `sweaas/rds-credentials`).
  - **IaC:** CDK (TypeScript) in [`infra/`](infra/).
  - **CI/CD:** [`.github/workflows/deploy-aws.yml`](.github/workflows/deploy-aws.yml) builds + pushes Docker to ECR + updates ECS. Amplify handles frontend deploys.
- **Local dev:** Docker Compose for PostgreSQL, Redis, ChromaDB (unchanged). See [`local_dev.md`](local_dev.md).

## Architecture

```
          sweaas.com (Amplify CDN)
                │
Frontend (React + Vite + Three.js)
                │
          api.sweaas.com (ALB)
                │
  FastAPI on ECS Fargate ── Auth Middleware (Supabase JWT)
                │
   Service Layer
   ├── GitHubService        → GitHub App API (repo CRUD)
   ├── OrchestrationService → LangGraph agent hierarchy
   ├── SandboxService       → E2B Firecracker microVMs
   ├── BudgetService        → BudgetTracker + Stripe billing
   ├── MemoryService        → ChromaDB vector store
   ├── CommunicationService → AgentMail + Tavus + Golpo
   └── ObservabilityService → Sentry + metrics
                │
   Agent Hierarchy (LangGraph)
   ├── CTO Agent (supervisor)
   ├── Engineering Manager → Frontend Dev, Backend Architect, DevOps, QA
   ├── Product Manager     → Product Ops
   └── Marketing Manager   → Growth Analyst
                │
   AWS Infrastructure
   ├── RDS PostgreSQL 16 + pgvector   (db.t4g.micro)
   ├── ElastiCache Redis 7            (cache.t3.micro)
   └── ChromaDB on ECS Fargate        (sweaas.local Cloud Map)
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose

### 1. Clone and Set Up

```bash
git clone https://github.com/SWEAAS/SWEAAS.git
cd SWEAAS
cp .env.example .env   # Fill in your API keys
```

### 2. Start Infrastructure

```bash
docker compose up -d   # PostgreSQL, Redis, ChromaDB
```

### 3. Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Run database migrations
cd backend && alembic upgrade head && cd ..

# Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
SWEAAS/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entrypoint + Sentry
│   │   ├── api/                 # Routes and middleware
│   │   │   ├── router.py        # Route aggregator
│   │   │   ├── middleware/      # Auth (Supabase JWT)
│   │   │   └── routes/          # All endpoint modules
│   │   ├── core/                # Config, database, dependencies
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Business logic layer
│   │   └── agents/              # LangGraph agent system
│   │       ├── graph.py         # Main graph definition
│   │       ├── state.py         # Shared state TypedDict
│   │       ├── nodes/           # CTO, managers, specialists
│   │       ├── tools/           # LangChain tools (E2B, GitHub, Sentry)
│   │       └── prompts/         # Role loader from agency-agents
│   ├── alembic/                 # Database migrations
│   └── tests/                   # Test suites
├── frontend/
│   └── src/
│       ├── api/                 # Axios API client
│       ├── store/               # Zustand state stores
│       ├── components/          # UI components
│       ├── views/               # Page views
│       └── three/               # 3D HQ (React Three Fiber)
├── docs/                        # Prompt templates + doc index
├── vendor/                      # Cloned dependencies (gitignored — clone locally)
│   ├── agency-agents/           # Agent role definitions
│   └── nemoclaw/                # NVIDIA NemoClaw blueprints
├── infra/                       # AWS CDK (TypeScript) infrastructure
│   ├── bin/infra.ts            # CDK app entrypoint
│   └── lib/sweaas-stack.ts     # All AWS resources (VPC, RDS, ECS, ALB, etc.)
├── docker-compose.yml           # Local dev: PostgreSQL, Redis, ChromaDB
├── pyproject.toml               # Python dependencies
├── prompt.md / plan.md          # Product vision (reference)
└── .env.example                 # All required env vars
```

## API Endpoints

| Route                          | Method | Description                          |
| ------------------------------ | ------ | ------------------------------------ |
| `/api/v1/health`               | GET    | Liveness check                       |
| `/api/v1/auth/me`              | GET    | Current user profile                 |
| `/api/v1/projects`             | POST   | Create project + GitHub repo         |
| `/api/v1/projects`             | GET    | List user projects                   |
| `/api/v1/agents`               | GET    | List all agents                      |
| `/api/v1/agents/{id}`          | GET    | Agent details                        |
| `/api/v1/agents/{id}/chat`     | POST   | Chat with agent (context injection)  |
| `/api/v1/budget/summary`       | GET    | Token consumption overview           |
| `/api/v1/budget/estimate`      | POST   | Budget estimation                    |
| `/api/v1/budget/checkout`      | POST   | Stripe Checkout session              |
| `/api/v1/onboarding/assess`    | POST   | Onboarding assessment                |
| `/api/v1/communication/customer-call` | POST | Tavus call for **end users** (support) |
| `/api/v1/communication/cto-call` | POST | Start Tavus CTO video call (owner)   |
| `/api/v1/communication/email`  | POST   | Send email via AgentMail             |
| `/api/v1/feedback`             | POST   | Submit user feedback (→ agents/webhook) |
| `/api/v1/feedback`             | GET    | List feedback (optional `project_id`) |
| `/api/v1/feedback/webhooks/intercom` | POST | Ingest Intercom-style payloads |
| `/api/v1/feedback/webhooks/canny` | POST | Ingest Canny-style payloads      |
| `/api/v1/observability/overview` | GET  | Dashboard metrics                    |
| `/api/v1/observability/sentry/issues` | GET | Unresolved Sentry issues       |

## Integrations

| Service        | Purpose                              | Config Key               |
| -------------- | ------------------------------------ | ------------------------ |
| **LangGraph**  | Hierarchical agent orchestration     | `OPENAI_API_KEY`         |
| **OpenAI/xAI** | Multi-model routing + budget         | `XAI_API_KEY`            |
| **E2B**        | Sandboxed code execution             | `E2B_API_KEY`            |
| **ChromaDB**   | Agent memory / codebase RAG          | `CHROMA_HOST`            |
| **Supabase**   | Authentication + PostgreSQL          | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| **GitHub App** | Repo creation + collaborators        | `GITHUB_APP_*`           |
| **Sentry**     | Error tracking + auto-fix discovery  | `SENTRY_DSN`             |
| **Stripe**     | Subscription billing                 | `STRIPE_SECRET_KEY`      |
| **AgentMail**  | Email for AI agents                  | `AGENTMAIL_API_KEY`      |
| **Tavus**      | CTO + customer video (CVI)           | `TAVUS_API_KEY`, `TAVUS_CUSTOMER_*` |
| **Golpo**      | AI explainer videos                  | `GOLPO_API_KEY`          |
| **Feedback webhook** | Fan-out feedback to Slack/Zapier | `FEEDBACK_WEBHOOK_URL`   |
| **Twilio** (optional) | Voice/SMS escalation          | `TWILIO_*`               |
| **Intercom / Canny** | Ingest via `/feedback/webhooks/*` | HTTPS + secret headers (extend as needed) |

## Adding New Integrations

1. Create a service in `backend/app/services/<name>_service.py`
2. Add schemas in `backend/app/schemas/<name>_schema.py`
3. Create a router in `backend/app/api/routes/<name>_router.py`
4. Register the router in `backend/app/api/router.py`
5. Add the dependency factory in `backend/app/core/dependencies.py`
6. Add config keys in `backend/app/core/config.py` and `.env.example`

## Development Workflow

Both engineers work around the FastAPI API as the primary handoff boundary:

1. Define the API contract (schemas + endpoints)
2. Backend implements the service logic
3. Frontend integrates via the generated API client
4. All new features are shipped as new endpoints — no cross-cutting imports

## License

Proprietary — SWEAAS
