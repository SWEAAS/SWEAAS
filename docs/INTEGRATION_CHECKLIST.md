# External services — integration checklist

Sequenced todo list to get SWEAAS working end-to-end. Phases 0–6 are complete. Start from **Phase 7**.

For day-to-day local commands, see [local_dev.md](../local_dev.md).  
Environment template: [.env.example](../.env.example)

---

## Phase 0 — Repository and secrets hygiene ✅

- [x] **0.1** `.env.example` copied to `.env`. Never commit `.env`, `*.pem`, or `*-adminsdk-*.json`.
- [x] **0.2** Docker Compose stack chosen (`docker compose up` brings Postgres, Redis, ChromaDB).

---

## Phase 1 — Core infrastructure ✅

- [x] **1.1 PostgreSQL** — Running via Docker Compose; `DATABASE_URL` set.
- [x] **1.2 Redis** — Running via Docker Compose; `REDIS_URL` set.
- [x] **1.3 ChromaDB** — Running on port `8100`; `CHROMA_HOST`/`CHROMA_PORT` set.

---

## Phase 2 — Authentication (Supabase) ✅

- [x] **2.1** Supabase project created. `SUPABASE_URL` set.
- [x] **2.2** API keys: `SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` set.
- [x] **2.3** JWT verification via JWKS (ES256/RS256) ready. `AUTH_ENFORCE_JWT=false` for local dev.

---

## Phase 3 — LLM ✅

- [x] **3.1** `LLM_DEFAULT_MODEL=xai/grok-4-1-fast-reasoning` with `XAI_API_KEY` set.
- [x] **3.2** OpenAI and Anthropic keys also set as backups.

---

## Phase 4 — GitHub App ✅

- [x] **4.1** GitHub App created (App ID `3188178`), private key downloaded.
- [x] **4.2** Webhook configured with smee.io tunnel.

---

## Phase 5 — E2B (sandboxed execution) ✅

- [x] **5.1** `E2B_API_KEY` set.

---

## Phase 6 — LLM provider keys ✅

- [x] **6.1** LiteLLM removed. Direct calls via OpenAI/Anthropic SDKs. Budget tracking via `BudgetTracker` + `TokenUsageLog`.

---

## Phase 7 — Observability and billing

### 7.1 Sentry (platform monitoring + per-project error tracking)

Sentry serves two roles in SWEAAS:

1. **Platform monitoring** — the SDK in `main.py` auto-captures unhandled exceptions for the SWEAAS backend itself (the `sweaas` Sentry project).
2. **Per-customer-project monitoring** — when a customer creates a SWEAAS project, the backend auto-provisions a new Sentry project under your org, retrieves its DSN, and links the GitHub repo for suspect commits. Agents and the observability dashboard then query issues **per customer project**.

#### Architecture

```
POST /projects
  ├─ Create GitHub repo
  ├─ Create Sentry project  →  POST /api/0/teams/{org}/{team}/projects/
  ├─ Get client DSN          →  POST /api/0/projects/{org}/{slug}/keys/
  ├─ Link GitHub repo        →  POST /api/0/organizations/{org}/repos/
  └─ Persist slug + DSN to DB
```

Agents pass the customer project's `sentry_project_slug` (from the DB) when querying issues, instead of the hardcoded `sweaas` slug.

#### Setup

1. Go to [sentry.io](https://sentry.io) → **Create a project** → Platform: **Python / FastAPI** → name it `sweaas` (this is the platform project).
2. Copy the **DSN** from Settings → Client Keys.
3. Go to **Settings → Auth Tokens** → create a token with these scopes:
   - `project:read` — querying issues
   - `project:write` — creating customer projects + client keys
   - `project:releases` — associating commits with releases
4. Note your **Organization slug** (from the URL: `sentry.io/organizations/<slug>/`).
5. Go to **Settings → Teams** → create or note a **team slug** (e.g. `engineering`). Customer Sentry projects will be created under this team.
6. *(Recommended)* Install the **GitHub integration** in Sentry: Settings → Integrations → GitHub → Install. This enables automatic commit linking when releases are created.

**`.env` values:**

```
SENTRY_DSN=https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>
SENTRY_AUTH_TOKEN=sntrys_...                # Auth token with project:read+write+releases
SENTRY_ORG=your-org-slug                    # Organization slug from URL
SENTRY_PROJECT=sweaas                       # Platform project slug (for SWEAAS's own errors)
SENTRY_TEAM=your-team-slug                  # Team under which customer projects are created
```

**Where it's used:**

| File | Purpose |
|---|---|
| `backend/app/main.py` | `sentry_sdk.init()` with the DSN (platform monitoring) |
| `backend/app/services/sentry_service.py` | Creates Sentry projects, retrieves DSNs, links repos, creates releases, lists issues |
| `backend/app/api/routes/project_router.py` | Auto-provisions Sentry project on `POST /projects` |
| `backend/app/services/observability_service.py` | `list_sentry_issues(project_slug=...)` — per-project or platform |
| `backend/app/agents/tools/sentry_tools.py` | `get_unresolved_issues(project_slug)` — agents pass the customer slug |
| `backend/app/api/routes/observability_router.py` | `GET /observability/sentry/issues?project_slug=...` |

**Verify:**

```bash
# Platform monitoring: trigger a test error
curl http://localhost:8000/api/v1/health/sentry-debug

# Platform issues: query the SWEAAS project (omit project_slug)
curl -s http://localhost:8000/api/v1/observability/sentry/issues | python3 -m json.tool

# Customer project issues: pass the project's sentry slug
curl -s "http://localhost:8000/api/v1/observability/sentry/issues?project_slug=my-customer-project" | python3 -m json.tool
```

---

### 7.2 Stripe (subscription billing)

Stripe creates checkout sessions for project subscriptions. The webhook endpoint exists but signature verification is not yet wired — just the checkout flow works.

**Setup:**

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys.
2. Copy the **Secret key** (`sk_test_...`) and **Publishable key** (`pk_test_...`).
3. For webhooks: Developers → Webhooks → Add endpoint:
   - URL: `https://your-domain.com/api/v1/budget/webhook` (or use [Stripe CLI](https://stripe.com/docs/stripe-cli) for local: `stripe listen --forward-to localhost:8000/api/v1/budget/webhook`).
   - Events to listen for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`.
   - Copy the **Signing secret** (`whsec_...`).
4. Create at least one **Price** in the Stripe Dashboard (Products → Add product → set a recurring price). Note the **Price ID** (`price_...`) — you'll pass it when creating checkout sessions.

**`.env` values:**

```
STRIPE_SECRET_KEY=sk_test_...               # Secret key (server-side only)
STRIPE_PUBLISHABLE_KEY=pk_test_...          # Publishable key (passed to frontend)
STRIPE_WEBHOOK_SECRET=whsec_...             # Webhook signing secret
```

**Where it's used:**
- `backend/app/services/budget_service.py` — `stripe.checkout.Session.create()` using `STRIPE_SECRET_KEY`. Falls back to a placeholder URL when no key is set.
- `backend/app/api/routes/budget_router.py` — `POST /budget/checkout` triggers checkout; `POST /budget/webhook` receives Stripe events (stub — returns "Webhook received").
- `backend/app/models/budget.py` — `BudgetAllocation` stores `stripe_subscription_id` / `stripe_customer_id`.

**Verify:**

```bash
# Test checkout (returns a Stripe-hosted URL):
curl -X POST "http://localhost:8000/api/v1/budget/checkout?project_id=test&price_id=price_xxx"

# Without STRIPE_SECRET_KEY set, you'll get a dev-placeholder URL — that's expected.
```

---

### 7.3 LangSmith (agent tracing — optional)

LangSmith gives you a timeline view of every LangGraph step. The env vars are declared in `config.py` but **not explicitly wired in code** — LangChain auto-detects them via environment variables when `LANGCHAIN_TRACING_V2=true`.

**Setup:**

1. Go to [smith.langchain.com](https://smith.langchain.com) → sign up / sign in.
2. Settings → API Keys → Create API Key → copy it.
3. Create a project (default name: `sweaas`).

**`.env` values:**

```
LANGCHAIN_TRACING_V2=true                   # Enables auto-tracing for LangGraph
LANGCHAIN_API_KEY=lsv2_pt_...               # LangSmith API key
LANGCHAIN_PROJECT=sweaas                     # Project name in LangSmith
```

**How it works:** LangChain/LangGraph reads these env vars directly at import time. When `LANGCHAIN_TRACING_V2=true`, every `StateGraph` invocation is automatically traced and sent to LangSmith. No code changes needed.

**Verify:** Run any agent task via the API, then check [smith.langchain.com](https://smith.langchain.com) → your project → Runs.

> **Note:** Set `LANGCHAIN_TRACING_V2=false` (or remove it) to disable tracing and avoid network overhead in development.

---

## Phase 8 — Product communication features

### 8.1 AgentMail (AI agent email)

AgentMail lets agents send and receive emails autonomously.

**Setup:**

1. Go to [agentmail.to](https://agentmail.to) → sign up → Dashboard → API Keys → create one.

**`.env` value:**

```
AGENTMAIL_API_KEY=am_...
```

**Where it's used:**
- `backend/app/services/communication_service.py` — `AgentMail(api_key=...)` client creates inboxes and sends emails.
- `backend/app/agents/tools/communication_tools.py` — `send_agent_email` tool uses the same client.

**Verify:**

```bash
curl -X POST http://localhost:8000/api/v1/communication/email \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "subject": "Test", "body": "Hello from SWEAAS"}'
```

---

### 8.2 Tavus (AI video calls)

Tavus creates video conversations with AI replicas. SWEAAS uses it for CTO video calls (internal) and customer support video calls (end-user facing).

**Setup:**

1. Go to [platform.tavus.io](https://platform.tavus.io) → sign up.
2. Settings → API Keys → create one → copy it.
3. Create a **Replica** (your AI avatar) → copy the Replica ID.
4. Create a **Persona** (conversation personality/prompt) → copy the Persona ID.
5. Optionally create a second replica + persona for customer-facing video support.

**`.env` values:**

```
TAVUS_API_KEY=tvs_...                       # API key
TAVUS_REPLICA_ID=r_...                      # CTO video replica
TAVUS_PERSONA_ID=p_...                      # CTO conversation persona
# Optional: separate customer support video identity
TAVUS_CUSTOMER_REPLICA_ID=r_...
TAVUS_CUSTOMER_PERSONA_ID=p_...             # Falls back to CTO if unset
```

**Where it's used:**
- `backend/app/services/communication_service.py` — `httpx.AsyncClient().post("https://tavusapi.com/v2/conversations", ...)` with the API key, replica, and persona IDs. Two methods: `create_cto_call` and `create_customer_support_call`.

**Verify:**

```bash
curl -X POST http://localhost:8000/api/v1/communication/cto-call \
  -H "Content-Type: application/json" \
  -d '{"conversation_name": "Test call"}'
```

---

### 8.3 Golpo (explainer videos)

Golpo generates short AI explainer videos from text.

**Setup:**

1. Go to [golpoai.com](https://golpoai.com) → sign up → Dashboard → API Keys → create one.

**`.env` value:**

```
GOLPO_API_KEY=glp_...
```

**Where it's used:**
- `backend/app/services/communication_service.py` — `httpx.AsyncClient().post("https://api.golpoai.com/v1/videos", ...)` with Bearer auth.

**Verify:**

```bash
curl -X POST http://localhost:8000/api/v1/communication/explainer \
  -H "Content-Type: application/json" \
  -d '{"title": "What is SWEAAS?", "script": "SWEAAS automates software engineering..."}'
```

---

### 8.4 Feedback webhook (Slack / Zapier fan-out — optional)

When user feedback is submitted, the backend can forward it as a JSON POST to an external URL (Slack incoming webhook, Zapier catch hook, etc.).

**Setup (Slack example):**

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch.
2. Features → Incoming Webhooks → Activate → Add New Webhook to Workspace → pick a channel.
3. Copy the webhook URL (`https://hooks.slack.com/services/T.../B.../xxx`).

**Setup (Zapier example):**

1. Create a Zap → Trigger: Webhooks by Zapier → Catch Hook → copy the webhook URL.

**`.env` value:**

```
FEEDBACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
```

**Where it's used:**
- `backend/app/services/feedback_service.py` — `httpx.post(settings.feedback_webhook_url, json=feedback_row)` fires on every feedback submission when the URL is set. Silently skipped when empty.

**Verify:** Submit feedback via `POST /api/v1/feedback`, then check your Slack channel or Zapier history.

---

### 8.5 Twilio (voice/SMS escalation — future)

Twilio config is declared in `config.py` but **not implemented** in any backend code yet. These vars are placeholders for a future human escalation feature.

**`.env` values (set when ready):**

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

**No action needed now.** The `twilio` package is not in `pyproject.toml` yet.

---

## Phase 9 — Firebase Hosting (frontend deploy)

Firebase Hosting serves the React/Vite frontend. Deployment is automated via GitHub Actions.

**Setup:**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → select your project (or create one).
2. Install the CLI: `npm install -g firebase-tools` → `firebase login`.
3. Project Settings → Service Accounts → Generate new private key → download the JSON file.
4. In your GitHub repo: Settings → Secrets and variables → Actions → New repository secret:
   - Name: `FIREBASE_SERVICE_ACCOUNT_SWEAAS`
   - Value: paste the **entire contents** of the downloaded JSON file.
5. Add another secret:
   - Name: `VITE_API_BASE_URL`
   - Value: your public API URL, e.g. `https://api.sweaas.dev/api/v1`

**Where it's used:**
- `.github/workflows/deploy-firebase-hosting.yml` — builds the frontend with `VITE_API_BASE_URL` and deploys to Firebase Hosting using the service account secret.

**Verify:** Push to `main` (or the configured trigger branch) and check the GitHub Actions run. The deployed URL appears in the Firebase Console → Hosting.

> **Note:** The Firebase Admin SDK JSON file (`sweaas-firebase-adminsdk-*.json`) in the repo root is for server-side Firebase operations (not currently used in backend code). Keep it `.gitignore`'d.

---

## Quick "end-to-end smoke" path

```bash
# 1. Start infrastructure
docker compose up --build

# 2. Verify backend
curl http://localhost:8000/          # → {"message": "SWEAAS backend is running.", ...}
curl http://localhost:8000/docs      # → Swagger UI (when AUTH_ENFORCE_JWT=false)

# 3. Test agent flow
curl -X POST http://localhost:8000/api/v1/agents/cto-01/task \
  -H "Content-Type: application/json" \
  -d '{"task": "Build a user authentication system"}'

# 4. Check budget
curl http://localhost:8000/api/v1/budget/summary
```

---

## References

| File | What it does |
|---|---|
| [.env.example](../.env.example) | All env vars with comments |
| `backend/app/core/llm.py` | Multi-provider LLM calls (OpenAI/xAI/Anthropic) |
| `backend/app/core/llm_budget.py` | Per-agent budget tracking + `TokenUsageLog` persistence |
| `backend/app/core/config.py` | All `Settings` fields and defaults |
| `backend/app/services/communication_service.py` | AgentMail, Tavus, Golpo integration |
| `backend/app/services/budget_service.py` | Budget snapshots + Stripe checkout |
| `backend/app/services/sentry_service.py` | Per-project Sentry provisioning, issue querying, release management |
| `backend/app/services/observability_service.py` | Sentry issues API (per-project or platform) |
| `backend/app/api/routes/project_router.py` | Project CRUD + auto-provisions GitHub repo + Sentry project |
