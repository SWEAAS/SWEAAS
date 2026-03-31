# SWEAAS — SWE as a Service

A platform that gives anyone access to a ready-to-go AI-powered software engineering team.
Solo founders and small teams get a full engineering department — CTO, managers, and specialist agents — that autonomously plans, builds, tests, and ships code within a user-defined budget.

---

## Architecture

```
Frontend (React + Vite + Three.js)
        │
        ▼
  FastAPI API Layer ── Auth Middleware (Supabase JWT)
        │
   Service Layer
   ├── GitHubService      → GitHub App API (repo CRUD)
   ├── OrchestrationService → LangGraph agent hierarchy
   ├── SandboxService     → E2B Firecracker microVMs
   ├── BudgetService      → LiteLLM + Stripe billing
   ├── MemoryService      → ChromaDB vector store
   ├── CommunicationService → AgentMail + Tavus + Golpo
   └── ObservabilityService → Sentry + metrics
        │
   Agent Hierarchy (LangGraph)
   ├── CTO Agent (supervisor)
   ├── Engineering Manager → Frontend Dev, Backend Architect, DevOps, QA
   ├── Product Manager    → Product Ops
   └── Marketing Manager  → Growth Analyst
        │
   Infrastructure
   ├── PostgreSQL + pgvector
   ├── Redis (budget tracking)
   └── ChromaDB (agent memory)
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
├── vendor/                      # Cloned dependencies
│   ├── agency-agents/           # Agent role definitions
│   └── nemoclaw/                # NVIDIA NemoClaw blueprints
├── docker-compose.yml           # PostgreSQL, Redis, ChromaDB
├── pyproject.toml               # Python dependencies
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
| `/api/v1/communication/cto-call` | POST | Start Tavus CTO video call           |
| `/api/v1/communication/email`  | POST   | Send email via AgentMail             |
| `/api/v1/observability/overview` | GET  | Dashboard metrics                    |
| `/api/v1/observability/sentry/issues` | GET | Unresolved Sentry issues       |

## Integrations

| Service        | Purpose                              | Config Key               |
| -------------- | ------------------------------------ | ------------------------ |
| **LangGraph**  | Hierarchical agent orchestration     | `OPENAI_API_KEY`         |
| **LiteLLM**    | Multi-model routing + budget         | `LITELLM_MASTER_KEY`     |
| **E2B**        | Sandboxed code execution             | `E2B_API_KEY`            |
| **ChromaDB**   | Agent memory / codebase RAG          | `CHROMA_HOST`            |
| **Supabase**   | Authentication + PostgreSQL          | `SUPABASE_*`             |
| **GitHub App** | Repo creation + collaborators        | `GITHUB_APP_*`           |
| **Sentry**     | Error tracking + auto-fix discovery  | `SENTRY_DSN`             |
| **Stripe**     | Subscription billing                 | `STRIPE_SECRET_KEY`      |
| **AgentMail**  | Email for AI agents                  | `AGENTMAIL_API_KEY`      |
| **Tavus**      | CTO video calls                      | `TAVUS_API_KEY`          |
| **Golpo**      | AI explainer videos                  | `GOLPO_API_KEY`          |

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
