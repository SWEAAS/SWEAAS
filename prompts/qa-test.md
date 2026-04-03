# SWE as a Service — Production E2E QA checklist & test plan

**Test owner:** `odzjeffreyjr@gmail.com` · **GitHub:** `odzjeffreyjr`  
**Production surfaces:** Web app (e.g. `https://sweaas.com` via Amplify) · API `https://api.sweaas.com/api/v1`  
**How to use this doc:** Execute sections in order during a live session. Check each box as you verify.

---

## 0. Preconditions

- [ ] Browser: latest Chrome or Safari, clean cache or incognito for a “first visit” pass.
- [ ] Supabase email/GitHub OAuth flows enabled for the prod project; redirect URLs include prod domain + `/auth/callback`.
- [ ] You have access to: AWS ECS logs (backend), optional LangSmith (if `LANGCHAIN_TRACING_V2`), optional Sentry, optional Slack/`FEEDBACK_WEBHOOK_URL` destination.

---

## 1. UI components — ordered user flow

### 1.1 Landing & authentication (`/login`)

| # | Component / screen | What it looks like | Action | Expected result |
|---|-------------------|-------------------|--------|-----------------|
| 1 | **SWEAAS header** | Large “SWEAAS” title, subtitle “Your AI-powered engineering team” | Read | Branding loads; no console errors. |
| 2 | **OAuth: Continue with Google** | Full-width outlined button | Click | Redirect to Google consent; after success, redirect to app. |
| 3 | **OAuth: Continue with GitHub** | Dark GitHub-styled button | Click (primary for `odzjeffreyjr`) | GitHub auth; JWT issued; callback handled. |
| 4 | **Divider** “or continue with email” | Horizontal rule + label | — | Present when Supabase is configured. |
| 5 | **Sign up / Sign in toggle** | Text link under heading | Toggle to **Create Account** if new user | Form fields swap; heading shows “Create Account”. |
| 6 | **Email / password / full name** | Inputs in white card | Enter `odzjeffreyjr@gmail.com`, strong password, name; submit | New user: confirmation message if email confirm required; else lands in app. Existing: lands in app. |
| 7 | **Loading state** | “Loading…” full screen | Observe after OAuth redirect | Brief; then route resolves. |
| 8 | **Post-login redirect** | — | After successful auth | Navigates toward `/dashboard`; if onboarding incomplete, **redirect to `/onboarding`**. |

### 1.2 Onboarding (`/onboarding`) — wizard

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 9 | **Step rail** | Company → Departments → Cto → Review | Active step highlighted; Back/Next moves between steps. |
| 10 | **Company step** | Set company size slider/spinner, overall monthly budget (USD) | Values update; totals consistent with UI copy. |
| 11 | **Departments step** | Adjust headcount per department | Sum of department headcounts ≤ company size − 1 (CTO slot). Unassigned count shows correctly. |
| 12 | **CTO step** | Pick Tavus replica (avatar grid / selector) | Replica list loads from communications API; selecting sets CTO face for calls. |
| 13 | **Review step** | Phone (optional), budget alert %, email/SMS toggles | Fields editable; matches notification preference intent. |
| 14 | **Save / complete** | Primary save | Success: profile refresh, **`onboarding_completed` true**, redirect **to `/dashboard`**. |
| 15 | **Replica load failure** | If Tavus errors | Warning copy; save still possible when API recovers (per UI message). |

### 1.3 Shell & navigation (post-onboarding)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 16 | **Sidebar** | Click each nav item | Routes: Dashboard, Visit The Office (`/hq`), Welcome to HQ, Agents, Org Chart, Budget, Revenue, Reports, CTO Call, Notifications, Settings. |
| 17 | **Org name** (if loaded) | — | Organization API returns org; sidebar shows name when available. |
| 18 | **Logout** | Click | Session cleared; return to `/login`. |

### 1.4 Dashboard & budget surfacing (`/dashboard`, `/budget`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 19 | **Dashboard metrics / cards** | Scroll, read | Data from API; loading states then content. |
| 20 | **Budget route** | Open `/budget` | Same dashboard view per routing; budget-related widgets consistent with API. |
| 21 | **Token / status indicators** | If shown | Align with `/agents` budget snapshots (healthy / warning / exhausted / strike). |

### 1.5 Agents (`/agents`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 22 | **Agent list / cards** | Scroll | Each agent: name, role, department, status badge, token usage. |
| 23 | **Search / filters** (if present) | Type / filter | List narrows correctly. |
| 24 | **Portrait / avatar** | Inspect | `poster_image_url` or generated fallback; no broken images. |
| 25 | **Call / message actions** | Open agent detail or message | API-backed actions succeed or show clear errors. |

### 1.6 Org chart (`/org-chart`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 26 | **Hierarchy view** | Pan/zoom / select nodes | CTO + departments reflect onboarding-created `agent_configs`. |
| 27 | **Profile cards** | Select agent | Detail panel matches agent store / API. |

### 1.7 3D HQ (`/hq`, `/welcome-hw`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 28 | **WebGL canvas** | Wait for lazy load | “Loading 3D…” then scene. |
| 29 | **Departments / avatars** | Click agents | Matches roster; navigation or modals work. |

### 1.8 CTO Call (`/cto-call`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 30 | **Pre-call screen** | Avatar, replica name, “Begin” CTA | Project selector (if multiple); warnings if agents near budget. |
| 31 | **Replica selector** | Change Tavus persona | Selection persists for session. |
| 32 | **Begin call** | Start call | Tavus/session integration loads; no stuck spinner. |
| 33 | **Employee vs CTO mode** (query params / internal) | If testing internal employee call | Requires call target + replica; button disabled until valid. |

### 1.9 Reports (`/reports`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 34 | **Report list / CTO report UI** | Open, refresh | Data from reports API or placeholders clearly labeled. |

### 1.10 Revenue (`/revenue`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 35 | **Charts / tabs** | Hover tooltips | Currency formatting correct; no blank chart on empty data. |

### 1.11 Notifications (`/notifications`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 36 | **Notification list / unread badge** | Open sidebar badge | Unread count matches list; mark read works. |

### 1.12 Settings (`/settings`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 37 | **Profile / org / integrations** | Edit and save | PATCH/PUT responses succeed; UI reflects `GET /auth/me` after refresh. |

### 1.13 Customer support preview (`/customer-support`)

| # | Component | Action | Expected result |
|---|-----------|--------|-----------------|
| 38 | **Support preview UI** | Exercise chat / preview | Loads without auth errors if route is protected—confirm behavior matches product intent. |

---

## 2. Backend data expectations (by flow stage)

Use as a reference for DB inspection or API responses (`GET` with Bearer token). Table names align with SQLAlchemy models.

### 2.1 First authenticated `GET /auth/me` (JWT enforced)

| Store | Table / area | Expected fields / behavior |
|-------|----------------|---------------------------|
| PostgreSQL | `organizations` | New row: `name` (derived), unique `slug`, `created_at`. |
| PostgreSQL | `users` | New row: `supabase_uid`, `email` (e.g. `odzjeffreyjr@gmail.com`), `full_name`, `github_username` populated from OAuth metadata when GitHub used (`odzjeffreyjr`), `organization_id` FK, `role` default `owner`, **`onboarding_completed` false**. |
| — | No agent rows yet | Until onboarding completes. |

### 2.2 Onboarding assess (if UI calls `POST /onboarding/assess`)

| Store | Expected |
|-------|----------|
| `users` | `phone_number` updated when email matches and phone provided. |
| `notification_preferences` | New row per user (project_id null): `email_enabled`, `sms_enabled`, `budget_threshold_percent`. |

### 2.3 Onboarding team save `PUT /onboarding/team-config`

| Store | Expected |
|-------|----------|
| `projects` | One default project per org if missing: `name`, `slug`, `organization_id`. |
| `project_configs` | `monthly_budget_usd` = payload `overall_budget_usd`. |
| `agent_configs` | Prior agents for project **deleted** and recreated: `name`, `role`, `department`, `hierarchy_level`, `parent_agent_id`, `daily_token_budget` (role-tiered: CTO 200k, manager 100k, specialist 75k), `replica_id`, media URLs, `description`, `current_focus`, `email` synthetic. |
| `users` | **`onboarding_completed` = true** for current user. |

### 2.4 Ongoing product usage

| API / area | Persistence |
|------------|-------------|
| `POST /agents/{id}/chat` | Agent service may log activity; memory/embeddings may write to `agent_memories` / vector store when features enabled. |
| Orchestration (`OrchestrationService.submit_task`) | In-memory `_SESSIONS`; `_persist_session` may create/update **`tasks`**, **`reports`**; `Task`: `project_id`, `title`, `description`, `status`, `result_summary`, optional `assigned_agent_id`. |
| Budget tracker | Runtime `BudgetTracker` + `agent_configs.tokens_used_today` / `strike_count` when synced from service. |
| Stripe | `POST /api/v1/budget/webhook` and `POST /api/v1/stripe/webhook` log events; subscription checkout logs metadata (e.g. `project_id`). |

### 2.5 Webhooks & side effects (when configured)

| Event | Side effect |
|-------|-------------|
| Orchestration completion | Optional POST to `FEEDBACK_WEBHOOK_URL` with session summary JSON. |
| User feedback | Optional forward to same webhook URL from feedback service. |
| GitHub `POST /github/webhook` | Ingested per router (push/PR/ping). |
| Intercom/Canny | `POST /feedback/webhooks/*` creates normalized feedback rows. |

---

## 3. Agent activity — what should run when

### 3.1 LangGraph hierarchy (orchestrated task)

When a full orchestration run executes (not stub path):

| Stage | Agent / node | Responsibility | Observable signal |
|-------|----------------|----------------|-------------------|
| Entry | **CTO** (`cto`) | Decompose user task | Logs: session id, task snippet; LangSmith run name `sweaas-session-*` if tracing on. |
| Gate | **Budget gate** | Reads `budget_remaining` in state | If ≤ 0 → **budget_strike** branch (no specialist fan-out). |
| Strike | **budget_strike** | Halts with “Budget exhausted” message | State `status` / `results` contain strike output; UI should show exhausted semantics if surfaced. |
| Continue | **budget_gate** → **Send** | Fan-out to department managers | Parallel manager nodes. |
| Engineering | **engineering_manager** → specialists | **frontend_dev**, **backend_architect**, **devops**, **qa_tester** | Logs per node; results aggregated. |
| Product | **product_manager** → **product_ops** | Roadmap synthesis | Single chain. |
| Marketing | **marketing_manager** → **growth_analyst** | Growth analysis | Single chain. |
| Merge | **aggregator** | Combine outputs | Growing `results` list in state. |
| Review | **cto_review** | Final review pass | `session_summary` / `direction_report` in session payload. |

### 3.2 Per-agent chat (`/agents/{id}/chat`)

| Expectation | Signal |
|-------------|--------|
| Correct agent persona loaded from DB | Response content matches role; no 404. |
| Budget pre-check | If over daily token budget, `BudgetExhaustedError` path → **strike_count** increment in tracker; API error surfaced to client. |

### 3.3 CTO Call (Tavus)

| Stage | Expectation |
|-------|-------------|
| Replicas list | `GET` via communications client returns Tavus replicas. |
| Briefing | Backend receives role/replica/topic for Tavus session start. |
| Failure | UI shows error state; network tab shows failing request URL and status. |

### 3.4 Schedulers / background (if enabled in prod)

| Component | Check |
|-----------|--------|
| `SchedulerService` jobs | ECS logs for cron-like execution; no unhandled exceptions. |

---

## 4. Sanity checks — wiring verification

### 4.1 API & infrastructure

- [ ] `GET https://api.sweaas.com/api/v1/health` returns **`200`** and `{"message":"ok"}`.
- [ ] Frontend `VITE_API_BASE_URL` points to **`https://api.sweaas.com/api/v1`** in prod builds.
- [ ] CORS allows prod web origin.
- [ ] ECS tasks healthy: target group passes health checks; new deployment reaches **steady state** after backend deploy.

### 4.2 Environment variables (backend)

- [ ] `SUPABASE_URL` + JWT verification aligned with frontend anon key / issuer.
- [ ] `DATABASE_URL` (async) valid; **Alembic migrations** applied in prod.
- [ ] LLM keys (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) present if agents must run non-stub.
- [ ] `E2B_*` or sandbox vars if code execution enabled.
- [ ] `STRIPE_WEBHOOK_SECRET` set to real secret (not placeholder) before relying on verified Stripe webhooks.
- [ ] `FEEDBACK_WEBHOOK_URL` optional: if set, orchestration completion posts JSON.

### 4.3 Auth flows

- [ ] OAuth redirect URI registered in Supabase for prod domain.
- [ ] After login, **`GET /auth/me`** returns `email`, `onboarding_completed`, `github_username` when applicable.
- [ ] Protected routes return **401** without Bearer token (smoke via `curl`).

### 4.4 Agent ↔ frontend propagation

- [ ] **`GET /agents`** list matches onboarding-created roster (names, departments, replica URLs).
- [ ] Budget UI: **`GET /budget/agents`** (or equivalent budget snapshot endpoint used by stores) shows **healthy / warning / exhausted / strike** consistent with token usage.
- [ ] Org chart and HQ pull from same agent source; no duplicate phantom agents.

### 4.5 Budget tracking

- [ ] Increasing token usage moves progress into **warning** (≥ 85%) then **exhausted** (100%).
- [ ] **Strike**: when exhausted with non-zero `strike_count`, snapshot **`status: strike`** from `BudgetService._build_snapshot`.
- [ ] LangGraph **budget_remaining** in orchestration state hits strike path when project budget depleted (separate from per-agent daily cap).

### 4.6 Strike escalation (two mechanisms)

| Mechanism | Where | QA action |
|-----------|--------|-----------|
| **Per-agent daily budget** | `BudgetTracker.check_budget` | Force or simulate overage; expect exception path and strike increment. |
| **Project session budget** | `_check_budget` in `graph.py` | Set `budget_remaining` to 0 in orchestration state (integration test) or use exhausted project; expect **budget_strike** node output instead of manager fan-out. |

### 4.7 Frontend hosting

- [ ] Amplify (or host) serves latest **`index.html`** and hashed assets after deploy.
- [ ] If Amplify app is **not** Git-connected, use **CreateDeployment / StartDeployment** or manual upload instead of `start-job RELEASE` (CLI may reject `RELEASE`).

---

## 5. Pass / fail log (fill during test run)

| Area | Pass? | Notes |
|------|-------|-------|
| Auth (email + GitHub) | | |
| Onboarding → dashboard | | |
| Agents / org / HQ | | |
| CTO Call / Tavus | | |
| Budget / strikes | | |
| Reports / revenue | | |
| Notifications / settings | | |

---

## 6. Original brief (reference)

> Full end-to-end user flow on **SWE as a Service** in production for `odzjeffreyjr@gmail.com` / GitHub `odzjeffreyjr`: UI components in order, backend data expectations, agent activity, and sanity checks — structured for a live test run.
