# Stream C — Core App Live Data (Static Audit)

## Execution mode: STATIC AUDIT (tool access blocked)

**Bash (curl), WebFetch, and every `mcp__Claude_in_Chrome__*` tool were denied
by the harness in this session.** Every attempt returned the permission-denied
error. Consequently I could not:
- hit `http://localhost:8000/api/v1/*` to capture live API responses
- query Postgres via `docker exec` to diff DB state
- drive the Vite frontend via the Chrome extension
- capture screenshots (none produced — `screenshots/` directory is unchanged)

What I *could* do is read the worktree source. So this report is a **static
wire-audit** — for each routed page I read the view component, traced every
API call it makes, then read the corresponding backend router + service to
confirm whether each endpoint is DB-backed, stubbed, or hardcoded. Rows below
are marked against what the *source* says, not what a live browser rendered.
Where the plan asked for a DB query, I note the expected query; actual DB
state was not verified in this run.

This limitation **does not invalidate the architectural findings** — the
most important finding of the live-data audit (agent graph stub fallback +
sessions never persisted) is 100% visible in source and is flagged below.

### Screenshots produced
None. The `screenshots/` directory was not written to. See the blocker note
above.

---

## Per-page element table

Columns: Page | Element | API endpoint | Backend implementation | Expected DB query | Result (static) | Notes

### C1. `/dashboard` (`frontend/src/views/DashboardView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /dashboard | `Agents` stat | `GET /observability/overview` → `.total_active_agents` | `ObservabilityService.get_overview` — `SELECT * FROM agent_configs [WHERE project_id=?]`, counts them | `SELECT COUNT(*) FROM agent_configs WHERE project_id=?;` | PASS (wire real) | Real DB read |
| /dashboard | `Active` stat | derived client-side from `agents[].status == "active"` | `GET /agents` → `AgentService.list_agents` | `SELECT id,status FROM agent_configs WHERE status='active'` | PASS (wire real) | Filtered in client |
| /dashboard | `Running` stat | `GET /observability/overview` → `.total_running_tasks` | `SELECT ... FROM agent_sessions WHERE status='running'` | `SELECT COUNT(*) FROM agent_sessions WHERE status='running';` | **PARTIAL** | Queries real table, but **no code ever INSERTs into `agent_sessions`** — see Finding #8 confirmation below. Will always return 0 in the DB-2026-04-23 baseline and forever after |
| /dashboard | `Warnings` stat | derived from `obsOverview.departments[].warnings` | overview sums `status=='warning'` per dept | same count query on `status='warning'` | PASS (wire real) | |
| /dashboard | `Budget %` stat | `GET /budget/summary` → `consumption_percent` | `BudgetService.get_summary` — real DB reads across `agent_configs` + `project_configs` | `SELECT SUM(tokens_used_today), SUM(daily_token_budget) FROM agent_configs WHERE project_id=?;` | PASS (wire real) | Real DB read |
| /dashboard | Budget chart (BudgetChart) | `GET /budget/summary.agents[]` | real | per-agent rows | PASS (wire real) | |
| /dashboard | Recent Tasks (TaskSummary) | `GET /orchestration/sessions/{pid}` + `GET /orchestration/status/{pid}` | `OrchestrationService.list_sessions` reads from **in-memory `_SESSIONS` dict**, NOT DB | (no DB row today) | **FAIL (confirms Finding #8)** | `agent_sessions` table has a model (`backend/app/models/agent.py:52`) but `grep -rn "AgentSession("` shows **zero** INSTANTIATIONS anywhere in the backend. `list_sessions` returns only entries from the Python process dict — lost on every uvicorn restart. Empty-state UI will show permanently |
| /dashboard | Live Errors (Sentry) | `GET /observability/sentry/issues` | real httpx call to `https://sentry.io/api/0/...` if token set | n/a (external) | PASS (wire real) | Degrades to `[]` on 403/404 — user sees "No unresolved issues" regardless of reachability, which is the UX documented in `observability_service.py:99-103` |
| /dashboard | Agent Directory preview (8 rows) | `GET /agents` | `AgentService.list_agents` — real SQL | `SELECT * FROM agent_configs [WHERE project_id=?] LIMIT 8;` | PASS (wire real) | Client slices first 8 |
| /dashboard | Repo link | uses `currentProject.github_repo_url` from store | `projectApi.list` → real | `SELECT github_repo_url FROM projects WHERE id=?;` | PASS (wire real) | |

### C2. `/welcome-hw` (`frontend/src/three/WelcomeHWView.tsx` + `WelcomeHWCanvas.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /welcome-hw | Building7EEVEE.glb | static asset `/models/Building7EEVEE.glb` | served by Vite — file present at repo root | n/a | COSMETIC | Static file |
| /welcome-hw | Stepper rooms | `ROOMS` constant in `tourStops.ts` | hardcoded | n/a | COSMETIC | Not data-driven |
| /welcome-hw | Side panel occupants | `GET /agents` via `useAgentStore` | real | `SELECT * FROM agent_configs WHERE project_id=?;` | PASS (wire real) | |
| /welcome-hw | Agent chat panel → "Send" | `POST /agents/{id}/chat` | `AgentService.chat` — calls `llm_completion()` with real LLM if `llm_has_credentials()`; **silent fallback** to `"[{agent_id}] Acknowledged: {first 100 chars}"` if no creds | n/a (LLM) | PASS-with-fallback | Fallback is detectable because `context_injected=false` in the response, but the UI doesn't surface that flag. With `xai_api_key` set (per preflight) the real path runs |
| /welcome-hw | TokenBurnOverlay totals | sums `agents[].tokens_used_today / daily_token_budget` | derived from `/agents` payload | `SELECT SUM(tokens_used_today) FROM agent_configs;` | PASS (wire real) | **MISNAMED**: It's a static snapshot not a "burn rate" — no polling, no delta/s. The visual ticker effect (if any) is cosmetic |

### C3. `/agents` (`frontend/src/views/AgentDirectoryView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /agents | Agent cards (name, role, dept, status) | `GET /agents` | real | `SELECT * FROM agent_configs WHERE project_id=?;` | PASS (wire real) | |
| /agents | Token usage bar `tokens_used_today / daily_token_budget` | same payload | real | same query | PASS (wire real) | Note: `tokens_used_today` is a counter on `agent_configs`, **not** derived from `token_usage_logs` in-list. The audit expectation "cross-check with SUM(total_tokens) FROM token_usage_logs WHERE agent_id=? AND created_at > NOW() - INTERVAL '1 day'" would need to be re-run live to confirm those two sources agree — this is a known dual-source risk |
| /agents | Call button | navigates to `/cto-call?replica=...` (no API call at click) | n/a | n/a | COSMETIC (navigation) | API call fires only on the cto-call page |
| /agents | Chat button | opens AgentChatPanel which calls `agentApi.chat(id, msg)` | real (see C2) | n/a | PASS (wire real) | |

### C4. `/org-chart` (`frontend/src/views/OrgChartView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /org-chart | Nodes | `GET /agents` | real | `SELECT * FROM agent_configs WHERE project_id=?;` | PASS (wire real) | |
| /org-chart | Hierarchy edges | uses `parent_agent_id` field on agent payload | `agent_configs.parent_agent_id` column | `SELECT id, parent_agent_id FROM agent_configs;` | PASS (wire real) | |
| /org-chart | Click node → detail | `GET /agents/{id}` | real | `SELECT * FROM agent_configs WHERE id=?;` | PASS (wire real) | |

### C5. `/reports` (`frontend/src/views/ReportsView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /reports | Report list (merged) | `GET /orchestration/reports/{pid}` + `GET /observability/reports?project_id=?` | both read `SELECT * FROM reports WHERE project_id=?` | `SELECT id, report_type, title, created_at FROM reports WHERE project_id=?;` | PASS (wire real) | **Plan mismatch**: the spec describes separate "Sessions tab" and "Direction reports tab"; the actual UI is a single dropdown that merges both (de-dup by id). No `agent_sessions` tab exists in the view |
| /reports | Selected report body | `GET /orchestration/reports/{pid}/{rid}` | `ReportService.get_report_detail` — real | `SELECT * FROM reports WHERE id=? AND project_id=?;` | PASS (wire real) | |
| /reports | Download .md | `GET /orchestration/reports/{pid}/{rid}/markdown` | real — renders markdown + `Content-Type: text/markdown; charset=utf-8` | n/a | PASS (wire real) | Backend attaches `Content-Disposition: attachment` |
| /reports | Download .pdf | `GET /orchestration/reports/{pid}/{rid}/pdf` | returns presigned S3 URL JSON if S3 configured, otherwise streams PDF bytes from `render_report_pdf_bytes` | n/a | PASS (wire real) | |

### C6. `/cto-call` and `/cto-call/all`

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /cto-call | Replica gallery | `GET /communication/replicas` | `ReplicaCatalogService.list_stored_replicas` — real DB read on `replica_profiles`; lazy-seeds from Tavus if empty | `SELECT COUNT(*) FROM replica_profiles;` (baseline 86) | PASS (wire real) | |
| /cto-call | Project selector | `GET /projects` | real | `SELECT * FROM projects;` | PASS (wire real) | |
| /cto-call | Start Call | `POST /communication/cto-call` | `CommunicationService` — Tavus API call returns a `conversation_url` | n/a (external) | PASS (wire real) | Returns empty/None if Tavus key not configured — would be reported as "server didn't return a call URL" in UI. Preflight says Tavus key set, so the real path should hit |
| /cto-call | Context sidebar | `GET /communication/cto-context` | real — reads all `agent_configs`, sums tokens, lists warnings | `SELECT ... FROM agent_configs;` | PARTIAL | The `active_tasks` field is **hardcoded `[]`** in `communication_router.py:267`. Warnings + token_pct are real |

### C7. `/customer-support` (`frontend/src/views/CustomerCallPreview.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /customer-support | Start Preview button | `POST /communication/customer-call` | `CommunicationService.create_customer_support_call` — real Tavus call with customer replica/persona env vars | n/a | PASS (wire real) | If `TAVUS_CUSTOMER_*` env not set the Tavus call returns no `conversation_url` and the UI shows "The server didn't return a call URL" — graceful |
| /customer-support | Project token copy | reads `currentProject.public_token` from store | real | `SELECT public_token FROM projects WHERE id=?;` | PASS (wire real) | |

### C8. `/notifications` (`frontend/src/views/NotificationsView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /notifications | Rows (all/unread) | `GET /notifications?unread_only=?` | `NotificationService.list_notifications` — real `SELECT * FROM notifications WHERE user_id=?` | `SELECT id, type, title, read_at FROM notifications WHERE user_id=(SELECT id FROM users WHERE email='user@sweaas.dev') ORDER BY created_at DESC;` | PASS (wire real) | Requires `ensure_db_user` to resolve dev-user |
| /notifications | Unread count badge | `GET /notifications/count` | real count query | `SELECT COUNT(*) FROM notifications WHERE user_id=? AND read_at IS NULL;` | PASS (wire real) | |
| /notifications | Click notification → mark read | `POST /notifications/read` body `{notification_ids:[id]}` | real `UPDATE notifications SET read_at=NOW() WHERE id IN (...)` | DB `read_at` populated after click | PASS (wire real) | |

### C9. `/settings` (`frontend/src/views/SettingsView.tsx`)

| Page | Element | API endpoint | Backend impl | Expected DB query | Result | Notes |
|---|---|---|---|---|---|---|
| /settings | Project config save (budget/timeline/departments/max_agents/github_username) | `PATCH /projects/{id}/config` | real `UPDATE project_configs ...` | `SELECT monthly_budget_usd FROM project_configs WHERE project_id=?;` before/after | PASS (wire real) | Note: frontend calls `.patch` via `projectApi.patchConfig`; the task text said "PUT /projects/{id}/config" — the real verb is **PATCH**, not PUT |
| /settings | Theme picker (preset colours + hex) | uses `useThemeStore`; persisted to localStorage only | none (no API) | n/a | **COSMETIC** | As expected |
| /settings | Stripe setup button | **DOES NOT EXIST** | n/a | n/a | **FAIL** | Grep confirms: `stripeApi.*` is imported **only** in `stripeStore.ts` and used only by `RevenueView.tsx`. `SettingsView.tsx` has no Stripe import and no Stripe Connect onboarding button anywhere. This contradicts the C9 expectation that a button there triggers `POST /stripe/connect/onboard`. Cross-verified against Stream A1 assumption — the button exists in Revenue view, not Settings |
| /settings | Tavus warm-check (admin) | `POST /communication/admin/replicas/warm-check` | real — `ReplicaCatalogService.warm_check` with retry/backoff | n/a (external) | PASS (wire real) | Admin gate via `ensure_admin` |
| /settings | Reconciliation section | `GET /communication/admin/replicas/reconciliation` | real Tavus diff vs. DB | `SELECT * FROM replica_profiles;` vs. live Tavus | PASS (wire real) | |
| /settings | Notification preferences save | `PUT /notifications/preferences` + `PUT /notifications/contact-info` | real | `SELECT * FROM notification_preferences WHERE user_id=?;` | PASS (wire real) | |

### C10. Orchestration end-to-end (CRITICAL — source audit of Finding #8)

| Step | What source says | Result | Notes |
|---|---|---|---|
| `POST /orchestration/execute` on `beta-launch` | handler calls `OrchestrationService.submit_task` | — | `api/routes/orchestration_router.py:23-47` |
| Calls `build_agent_graph` | `backend/app/agents/graph.py:106` exists and is importable (langgraph, langchain present per pyproject) | — | Real |
| `except ImportError` → `status="stub"` + `session_summary="Would execute: {task}"` | **Exists verbatim** at `orchestration_service.py:141-149` | **CONDITIONAL BUG** | If `langgraph` is installed and all specialist nodes import cleanly, this branch is not taken and real work happens. If *any* node module raises ImportError at runtime, response silently becomes `{"status":"stub"}` and UI accepts it. No flag returned to the caller distinguishes this from `"completed"` |
| On ImportError — no DB write, no notification | `_persist_session` and `_notify_completion` are only called on success path | **BUG** | Stub path returns early before DB persistence |
| Even on **success**, `AgentSession` is never inserted | `grep -rn "AgentSession("` → only 1 match: the class definition at `backend/app/models/agent.py:52`. No `INSERT`/`session.add(AgentSession(...))` anywhere | **BUG — CONFIRMS Finding #8** | `agent_sessions` table will stay at 0 rows forever. `GET /orchestration/sessions/{pid}` reads from `_SESSIONS: dict[str, dict[str, Any]] = {}` — an in-memory dict in the backend process (`orchestration_service.py:21`). Any uvicorn restart nukes history |
| On success, Report IS persisted | `_persist_session` writes `Report(project_id, title, summary, report_type="session")` to the `reports` table (`orchestration_service.py:304-327`) | PASS | Explains baseline `reports=52, agent_sessions=0` — the disparity is structural, not accidental |
| On success, Notification IS sent | `NotificationService.notify_orchestration_complete` called | PASS | In-app + email/SMS per preferences |
| Live POST to `beta-launch` would produce | +1 `reports` row, +1 `notifications` row, N `token_usage_logs` rows (via `llm_completion` wrapper), **0 new `agent_sessions` rows** | — | Not verified live in this run |

**Static-audit conclusion on Finding #8:** Confirmed. Two independent defects:
1. `agent_sessions` model exists but is never written to anywhere in the backend — the table is architecturally dead.
2. The orchestration `ImportError` branch at `orchestration_service.py:141` returns `status="stub"` with a `"Would execute: {task}"` placeholder, and both skipping DB persistence and notification. The FE has no visible handling for `status=="stub"` — `TaskSummary.tsx:42` renders `s.status ?? "completed"` and treats it as a generic badge.

---

## Summary of bugs confirmed / surfaced

### Confirmed (from pre-existing findings)
1. **Finding #8 — orchestration stub fallback is silent and DB is never hit**: source-verified in `orchestration_service.py`. On any ImportError inside `build_agent_graph` or its nodes, the service returns `status="stub"` with no session record, no notification, no report row. UI renders the stub status with the same treatment as `"completed"`.
2. **`agent_sessions` is a dead table**: model defined, referenced by `ObservabilityService.get_overview` (running-tasks count) and `AgentService.list_activity`, but **no code inserts rows**. The baseline `agent_sessions=0` despite `reports=52` is structural — it will never reach > 0 without a new insertion path.

### Newly surfaced in this pass
3. **`GET /communication/cto-context` returns `"active_tasks": []` hardcoded** (`communication_router.py:267`). The sidebar can never show a real active task until this is backed by a query (either `agent_sessions` once #1 is fixed, or an in-memory active-task registry). Everything else in the cto-context payload is DB-real.
4. **SettingsView has no Stripe Connect onboarding button** (`frontend/src/views/SettingsView.tsx` imports no `stripeApi`; only `RevenueView.tsx` does). Any test plan that clicks "Stripe setup" on Settings is verifying a UI that doesn't exist. Cross-verify with Stream A1.
5. **ReportsView doesn't have "Sessions" / "Direction reports" tabs** — it's a single dropdown merging orchestration+observability reports, de-duped by id. Audit plan was out of date with UI.
6. **TokenBurnOverlay is a snapshot, not a burn rate** (`frontend/src/three/ui/TokenBurnOverlay.tsx`). No polling, no delta/s counter — the name implies live behaviour the widget doesn't deliver. Cosmetic.
7. **`project_configs` PATCH endpoint, not PUT**: plan text mentioned `PUT /projects/{id}/config`; `projectApi.patchConfig` issues `PATCH`. Harmless documentation drift.
8. **Agent chat silent-fallback surface**: on missing LLM creds (`llm_has_credentials() == False`), `AgentService.chat` returns `"[{agent_id}] Acknowledged: {first 100 chars}"` with `context_injected=false`. The UI does not render the `context_injected` flag, so a user cannot distinguish a real LLM answer from the canned acknowledgement unless they read the text. Recommend surfacing this.
9. **Sentry `[]` path is ambiguous**: `ObservabilityService.list_sentry_issues` returns empty list on 403, 404, and transport error — all three are indistinguishable from "zero unresolved issues" in the UI (`DashboardView.tsx:180-184`). `SENTRY_ORG` / `SENTRY_PROJECT` misconfiguration will masquerade as a healthy state.

---

## Blocker / re-run requirements

To upgrade every PARTIAL or "wire-real" row to a numeric PASS/FAIL with actual
DB values, the next run needs **Bash (curl)** and **Chrome MCP** permissions
unblocked, or equivalent tool access that can:
- `curl http://localhost:8000/api/v1/*` (direct HTTP against the local uvicorn)
- `docker exec gallant-pascal-4547f4-postgres-1 psql -U sweaas -d sweaas -c '…'`
- drive `http://localhost:5173` to capture real network requests + screenshots

In particular, the C10 orchestration POST (`beta-launch` → "Say hello…") is the
single most valuable test to re-run live: it disambiguates whether the `"stub"`
branch actually fires in this install, and measures the real before/after
counts on `reports`, `notifications`, and `token_usage_logs`.
