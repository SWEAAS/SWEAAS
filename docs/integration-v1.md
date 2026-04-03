# Integration V1 — Frontend ↔ Backend Wiring Report

**Date:** 2026-04-03
**Scope:** Replace all hardcoded/mock data in the frontend with live API calls to the FastAPI backend. Run pending DB migrations. Holistic audit of every frontend-to-backend call.

---

## Summary

The SWEAAS frontend was architecturally wired to the backend (API client, Zustand stores, route structure) but several views rendered **static mock data** instead of calling the live endpoints, three Alembic migrations were pending, the auth router returned empty profile fields, and the spec-required global feedback button was missing. Two passes of integration work have fixed all of it — the second pass specifically targeted **every remaining hardcoded number, mock label, and synthetic timestamp** across all views.

---

## Critical Fix: Database Migrations

Three Alembic migrations were defined but **never applied** to the running PostgreSQL instance:

| Migration | What it adds |
|-----------|-------------|
| `a3f8c2d4e6b1` | `last_execution_at` column on `project_configs` |
| `b5e9d3f7a2c4` | `stripe_connected_accounts`, `stripe_payments`, `stripe_payouts` tables |
| `c7d4e8f9a1b2` | `phone_number` column on `users`, `notification_preferences` table, `notifications` table |

**Symptom:** Every notification endpoint (`/count`, `/preferences`, `/read`, etc.) returned **500 Internal Server Error** with `column users.phone_number does not exist`. The entire notifications surface was broken.

**Fix:** `alembic upgrade head` — all three applied cleanly.

---

## Changes Made

### 1. API Client — `frontend/src/api/client.ts`

**Added:** `orchestrationApi` namespace with five methods:

- `execute(data)` → `POST /orchestration/execute`
- `status(projectId)` → `GET /orchestration/status/{project_id}`
- `sessions(projectId)` → `GET /orchestration/sessions/{project_id}`
- `reports(projectId)` → `GET /orchestration/reports/{project_id}`
- `reportPdf(projectId, reportId)` → `GET /orchestration/reports/{project_id}/{report_id}/pdf`

These were defined in `FRONTEND_INTEGRATION.md` but never added to the client.

### 2. TaskSummary — `frontend/src/components/dashboard/TaskSummary.tsx`

| Before | After |
|--------|-------|
| Hardcoded 5-item `tasks` array with fake titles/agents | Fetches real data via `orchestrationApi.sessions()` and `orchestrationApi.status()` |
| Static "Implement onboarding wizard UI" etc. | Shows actual session tasks from the project's orchestration history |
| No loading or empty state | Loading spinner + empty state with CTA guidance |

### 3. CtoReport — `frontend/src/components/ui/cto-report.tsx`

| Before | After |
|--------|-------|
| `reportSections` was a const array with "Project Galaxy" hardcoded copy | Accepts optional `sections: ReportSection[]` prop |
| Timestamps were static ("9:12 AM", "9:18 AM"...) | Timestamps are computed dynamically |
| Always showed 4 hardcoded sections | Shows API-supplied sections, falls back to empty-state |

### 4. ReportsView — `frontend/src/views/ReportsView.tsx`

| Before | After |
|--------|-------|
| Title defaulted to "Project Galaxy delivery debrief" | Title from selected report or project name |
| Subtitle said "A mock Slack-style report..." | Subtitle shows report date and type |
| No API calls — static rendering only | Fetches from `orchestrationApi.reports()` + `observabilityApi.reports()` in parallel |
| No report selection | Dropdown selector when multiple reports exist |

### 5. SettingsView — `frontend/src/views/SettingsView.tsx`

| Before | After |
|--------|-------|
| Config form initialized with hardcoded defaults (`monthly_budget_usd: 2000`, etc.) | Hydrates from `projectApi.get(currentProject.id)` on mount |
| Form didn't reflect server state | Shows real server config; user edits overlay it |

### 6. authStore — `frontend/src/store/authStore.ts`

| Before | After |
|--------|-------|
| `login()` fabricated a `devUser` inline, never called the backend | `login()` sets dev-token then calls `fetchProfile()` → `GET /auth/me` |
| User data was always hardcoded | Profile comes from the database (uid, email, full_name, github_username, role) |
| No `fetchProfile` action | New `fetchProfile` action with graceful fallback |

### 7. Auth Router — `backend/app/api/routes/auth_router.py`

| Before | After |
|--------|-------|
| Returned `full_name: ""` and `github_username: ""` always | Queries the `users` DB table to return real stored fields |
| No DB dependency | Injects `AsyncSession`; falls back to JWT-only data if no DB row exists |

### 8. DashboardView — `frontend/src/views/DashboardView.tsx`

| Before | After |
|--------|-------|
| "Running" stat derived heuristically from agent `recent_activity` | Polls `orchestrationApi.status()` every 10s for real-time data |
| No observability overview data | Calls `observabilityApi.overview()` for total agent/task/warning counts |
| Stats row was partially synthetic | Stats prefer live observability data, fall back to store-derived values |

### 9. Global Feedback Button — `frontend/src/components/layout/FeedbackButton.tsx` (NEW)

Per the spec in `FRONTEND_INTEGRATION.md` §14, every page must have a feedback button.

- Fixed-position button (bottom-right) on every authenticated page
- Opens a modal with: title (required), description, category dropdown, priority selector
- Submits to `POST /api/v1/feedback` with the current project's `project_id`
- Shows confirmation toast on success
- Added to `AppLayout` so it renders on all routes

### 10. Feedback Schema — `backend/app/schemas/feedback_schema.py`

| Before | After |
|--------|-------|
| `source` accepted 7 values, missing `user_feedback`, `sentry`, `slack`, `github_issue` | Accepts all 11 source values from the integration doc |
| `category` missing `improvement` | Added `improvement` alongside existing `ux`, `billing` |
| `priority` limited to `low`, `medium`, `high` | Added `critical` |
| `body` required (min_length=1) | Defaults to empty string (body is optional in the spec) |

### 11. App.tsx — Profile Hydration on Load

| Before | After |
|--------|-------|
| Returning user with a token in localStorage had `user: null` until next login | `ProtectedRoute` calls `fetchProfile()` when authenticated but user is null |

---

## V1.1 — "All Numbers Dynamic" Sweep

A comprehensive audit identified every remaining hardcoded number, mock label, and synthetic value across all views and components. Every stat, count, and metric now flows from a backend API or computed store field.

### 12. TaskSummary — Agent Names from API

| Before | After |
|--------|-------|
| `agent: "CTO Agent"` hardcoded for every session | Reads `s.lead_agent`, `s.agent_name`, or `s.assigned_agent` from the sessions API |
| `"Active orchestration session"` synthetic title | Uses `statusRes.data.current_task` when available |

### 13. CtoReport — Real Timestamps and Dynamic Channel

| Before | After |
|--------|-------|
| `timeLabel` fabricated via `Date.now() - index * 480_000` | Uses `section.created_at` from the report when available |
| Channel name fell back to `"project-galaxy"` | Accepts `channelName` prop; `ReportsView` passes project name slugified; falls back to `"reports"` |
| `ReportSection` interface had no timestamp field | Added `created_at?: string` to the interface |

### 14. OrgChartView — Consistent Agent Counts

| Before | After |
|--------|-------|
| "Total agents" used `agents.length` (raw, without team config merge) | Uses `displayAgents.length` (consistent with all other views) |
| "Avg load" also used raw `agents` array | Uses `displayAgents` for consistent calculation |

### 15. Sidebar — Dynamic Notification Badge

| Before | After |
|--------|-------|
| No unread count indicator on sidebar | Shows red badge pill from `notificationStore.unreadCount` |
| Unread count only visible via Header bell | Sidebar "Notifications" link now also surfaces the count |

### 16. Header — Remove Mock Email Fallback

| Before | After |
|--------|-------|
| `{user?.email ?? "user@sweaas.dev"}` showed fake email | Displays `"—"` as neutral fallback when profile not loaded |

### 17. DashboardView — Enriched Budget Description

| Before | After |
|--------|-------|
| Description showed `N agents · $X budget` | Includes real-time: `N agents · $X budget · Y% consumed` |

---

## Holistic Audit Results

### API Endpoints: Frontend Coverage

| Endpoint | Frontend Status |
|----------|----------------|
| `GET /auth/me` | **Now wired** — authStore.fetchProfile() |
| `GET /agents` | Wired — agentStore |
| `GET /agents/{id}` | Wired — OrgChartView detail |
| `GET /agents/{id}/activity` | **Defined, unused** — no UI for individual activity timeline |
| `POST /agents/{id}/chat` | Wired — AgentChatPanel |
| `GET /budget/summary` | Wired — budgetStore |
| `POST /budget/estimate` | **Defined, unused** |
| `GET /budget/agents/{id}` | **Defined, unused** |
| `POST /budget/checkout` | **Defined, unused** — checkout CTA not built |
| `GET /projects` | Wired — projectStore |
| `GET /projects/{id}` | **Now wired** — SettingsView hydration |
| `PATCH /projects/{id}/config` | Wired — SettingsView save |
| `POST /projects` | Wired — CTOCallView project wizard |
| `GET /onboarding/team-config` | Wired — teamOnboardingStore |
| `PUT /onboarding/team-config` | Wired — teamOnboardingStore |
| `PATCH /onboarding/team-config/cto` | Wired — teamOnboardingStore |
| `GET /onboarding/departments` | **Defined, unused** |
| `POST /onboarding/assess` | **Defined, unused** |
| `GET /observability/overview` | **Now wired** — DashboardView stats |
| `GET /observability/reports` | **Now wired** — ReportsView |
| `GET /observability/sentry/issues` | Wired — DashboardView |
| `POST /orchestration/execute` | **Defined, unused** — no "run task" button yet |
| `GET /orchestration/status/{id}` | **Now wired** — DashboardView polling + TaskSummary |
| `GET /orchestration/sessions/{id}` | **Now wired** — TaskSummary |
| `GET /orchestration/reports/{id}` | **Now wired** — ReportsView |
| `GET /orchestration/reports/{id}/{rid}/pdf` | **Defined, unused** — no download button |
| `GET /stripe/connect/status` | Wired — stripeStore |
| `GET /stripe/revenue` | Wired — stripeStore |
| `GET /stripe/revenue/breakdown` | Wired — stripeStore |
| `GET /stripe/balance` | Wired — stripeStore |
| `GET /stripe/payments` | Wired — stripeStore |
| `GET /stripe/payouts` | Wired — stripeStore |
| `POST /stripe/connect/onboard` | Wired — stripeStore |
| `POST /stripe/connect/account-link` | Wired — stripeStore |
| `POST /stripe/checkout` | **Defined, unused** |
| `POST /feedback` | **Now wired** — FeedbackButton |
| `GET /feedback` | **Defined, unused** |
| `GET /notifications` | Wired — notificationStore |
| `GET /notifications/count` | Wired — notificationStore (Header polling) |
| `POST /notifications/read` | Wired — notificationStore |
| `POST /notifications/read-all` | Wired — notificationStore |
| `GET /notifications/preferences` | Wired — notificationStore |
| `PUT /notifications/preferences` | Wired — notificationStore |
| `PUT /notifications/contact-info` | Wired — SettingsView + OnboardingView |
| `POST /notifications/send` | **Defined, unused** — admin/internal only |
| `POST /communication/cto-call` | Wired — CTOCallView |
| `POST /communication/customer-call` | Wired — CustomerCallPreview |
| `GET /communication/cto-context` | Wired — CTOCallView (10s polling) |
| `GET /communication/replicas` | Wired — OnboardingView, CTOCallView, CTOReplicaDirectoryView |
| `POST /communication/admin/replicas/warm-check` | Wired — SettingsView |
| `GET /communication/admin/replicas/reconciliation` | Wired — SettingsView |
| `POST /communication/admin/replicas/reconciliation/actions` | Wired — SettingsView |
| `POST /communication/email` | **Not wired from frontend** (backend-only) |
| `POST /communication/customer-call/public` | **Defined, unused** — for end-user widget |
| `POST /communication/explainer-video` | **Defined, unused** |

### Hardcoded / Dev Strings Remaining

| Location | String | Status |
|----------|--------|--------|
| `CustomerCallPreview.tsx` | `https://meet.sweaas.dev/customer-demo` | **Acceptable fallback** — only shown on API error |
| `authStore.ts` | `user@sweaas.dev` | **Dev fallback** — only used when `/auth/me` fails |
| `SettingsView.tsx` | `user@sweaas.dev` | **Admin check** — matches dev seed user |
| `Header.tsx` | ~~`user@sweaas.dev`~~ | **Fixed** — now shows `"—"` when no profile |
| `cto-report.tsx` | ~~`project-galaxy`~~ | **Fixed** — now uses project name or `"reports"` |
| `TaskSummary.tsx` | ~~`"CTO Agent"`~~ | **Fixed** — reads agent name from API response |

### Silent Error Handling

Most stores swallow errors silently (`catch { /* silent */ }`). This is acceptable for dev resilience but should get proper error toasts in production.

---

## Remaining Items (Post-V1)

| Item | Priority | Notes |
|------|----------|-------|
| Real Supabase Auth flow | Medium | Currently uses `dev-token`; production needs Supabase sign-up/sign-in + JWT |
| `POST /orchestration/execute` UI | Medium | No "Run Task" button — sessions can only be created via API/scheduler |
| Report PDF download button | Low | `orchestrationApi.reportPdf()` added but no UI download button yet |
| WebSocket for orchestration status | Low | Polling works; WS would reduce latency |
| `CustomerCallPreview` fallback URL | Low | Hardcoded `meet.sweaas.dev/customer-demo` on API error |
| Search in Header | Low | Non-functional cosmetic input |
| Error toast system | Low | Most stores silently swallow errors |

---

## Verification

- **TypeScript:** `npx tsc --noEmit` passes with zero errors
- **Linting:** No new linter errors introduced
- **Database:** `alembic upgrade head` — 3 pending migrations applied
- **Backend endpoints verified:**
  - `GET /auth/me` → `200` with DB-enriched profile
  - `GET /notifications/count` → `200` (was 500 before migration)
  - `GET /notifications/preferences` → `200` (was 500 before migration)
  - `GET /budget/summary` → `200` with 12 agents
  - `GET /observability/overview` → `200` with department metrics
  - `POST /feedback` → `201` accepts `user_feedback` source

---

## File Inventory

| File | Action |
|------|--------|
| `frontend/src/api/client.ts` | Modified — added `orchestrationApi` |
| `frontend/src/App.tsx` | Modified — profile hydration on load |
| `frontend/src/components/dashboard/TaskSummary.tsx` | Rewritten — mock → API; dynamic agent names |
| `frontend/src/components/layout/AppLayout.tsx` | Modified — added FeedbackButton |
| `frontend/src/components/layout/FeedbackButton.tsx` | **New** — global feedback button per spec |
| `frontend/src/components/layout/Header.tsx` | Modified — removed mock email fallback |
| `frontend/src/components/layout/Sidebar.tsx` | Modified — dynamic notification badge |
| `frontend/src/components/ui/cto-report.tsx` | Modified — dynamic timestamps, channelName prop, `created_at` on sections |
| `frontend/src/views/ReportsView.tsx` | Rewritten — mock → API; passes timestamps + channel |
| `frontend/src/views/DashboardView.tsx` | Modified — orch polling + observability overview + enriched description |
| `frontend/src/views/OrgChartView.tsx` | Modified — consistent `displayAgents` for all stats |
| `frontend/src/views/SettingsView.tsx` | Modified — hydrates config from API |
| `frontend/src/store/authStore.ts` | Rewritten — calls `/auth/me` |
| `backend/app/api/routes/auth_router.py` | Rewritten — queries DB for enriched profile |
| `backend/app/schemas/feedback_schema.py` | Modified — widened source/category/priority enums |
| `backend/app/main.py` | Minor — dev user name preservation |
