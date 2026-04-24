# Stream B — Communication & Identity verification

Run on 2026-04-24 against local live stack (backend bare-metal on :8000, Postgres in `gallant-pascal-4547f4-postgres-1`, shared `.env` with all integration keys populated).

## Tell the operator — what you need to confirm on your side

| # | Where | What to check |
|---|-------|---------------|
| Op1 | Your physical phone `267-290-0504` | **No SMS arrived**. That matches the silent failure we observed — `notifications.sms_sent_at` stayed NULL even though the UI said `status:"delivered"`. Root cause: `twilio` SDK missing from the `.venv`. |
| Op2 | Mailbox for `user@sweaas.dev` | **No email arrived**. Root cause: AgentMail SDK version 0.4.15 rejects `display_name` kwarg that the code passes. |
| Op3 | Your GitHub account `odzjeffreyjr` | **You should have received a GitHub invite email** for repo `SWEAAS/project-verify-stream-b-1777001358` (or it was already auto-accepted since you're the admin). Confirm via `gh api /repos/SWEAAS/project-verify-stream-b-1777001358/collaborators` listing you as admin. |

## Results table

| # | Check | Expected | Actual | Evidence | Result |
|---|-------|----------|--------|----------|--------|
| B1 | PUT /notifications/contact-info phone=2672900504 | Stored in `users.phone_number` | `users.phone_number = "2672900504"` after 1st PUT; overwritten to `"+12672900504"` after 2nd PUT. Backend **does not normalize** E.164 format. | DB: `SELECT phone_number FROM users WHERE email='user@sweaas.dev'` | **PASS** (with caveat: no E.164 normalization) |
| B2 | SMS delivery to 2672900504 | `notifications.sms_sent_at` populated + text received on phone | Response `{channels_used:["in_app"], recipient_count:1}` (no SMS). DB row has `sms_sent_at=NULL`, `status="delivered"`. Backend log: **`SMS send failed: No module named 'twilio'`** at notification_service.py:520. | uvicorn log, DB | **FAIL — SILENT** |
| B3 | Email delivery to user@sweaas.dev | `email_sent_at` populated + mail received | `email_sent_at=NULL`, `status="delivered"`. Log: **`Email send failed: InboxesClient.create() got an unexpected keyword argument 'display_name'`** at notification_service.py:499. | uvicorn log, DB | **FAIL — SILENT** |
| B4 | POST /projects with github_username=odzjeffreyjr | Real repo on GitHub; odzjeffreyjr listed as collaborator | Repo `project-verify-stream-b-1777001358` created (private). `gh api` confirms existence, created_at `2026-04-24T03:29:18Z` (matches DB). **Collaborators: `odzjeffreyjr=admin`, `INTSEAN=read`**. No `_dev_mode:true` in response. Sentry project + DSN also created. | `gh api /repos/SWEAAS/project-verify-stream-b-1777001358`, `gh api .../collaborators` | **PASS** |
| B5 | Existing 5 projects' github_repo_url | Each is a real GitHub repo, not a dev-stub fabrication | Direct `curl -I` returns 404 for all 5 (private repos return 404 to unauth'd requests — expected). `gh api /orgs/SWEAAS/repos` authenticated lists 6 repos: the org itself + 5 `project-*` repos matching DB slugs exactly. | `gh api` | **PASS** |
| B6 | Auth enforcement flip (AUTH_ENFORCE_JWT=true) | Protected routes return 401 without JWT | **Not executed live** — would require backend restart and risked disrupting the shared stack. Static audit: `backend/app/api/middleware/` has `auth.py` that gates all `/api/v1` routes when flag is true; public exemptions in route decorators. | static read | **PARTIAL** (static-only) |
| B7 | Supabase OAuth callback | /auth/callback processes token and redirects to /dashboard | **Not executed live** — headless agent cannot complete OAuth. Static audit: `AuthCallbackView.tsx` reads Supabase hash params and calls /auth/me. | static read | **PARTIAL** |
| B8 | Onboarding flow | assess/contact/team-config all 2xx, DB persists config | POST /onboarding/assess 200 → returns hardcoded suggestions (same formula as budget/estimate: `estimated_monthly_cost_usd=112.5` regardless of inputs). GET /onboarding/team-config 200 returns stale data with `department_sizes: {engineering:22, ...}`. PUT /onboarding/team-config 200, `completed:true`. Round-trip works. | curl | **PASS** (with note: assessment cost is hardcoded formula) |
| B9 | PUT /notifications/preferences | Preferences persisted; rows not duplicated | **500 Internal Server Error** on every PUT. Each failed PUT still INSERTs a new preference row (left DB with duplicate rows). Root cause: `_pref_to_response` at notification_service.py:614 reads `pref.updated_at` after a flush that expired the attribute; SQLAlchemy triggers a lazy-load in async context → greenlet error. UI would show "saved" only after backend returns 200, which it doesn't. | uvicorn traceback, DB row explosion | **FAIL** |

## Bugs confirmed from plan preflight

- **Finding #4 (SMS silent skip)** — confirmed. Twilio creds ARE in .env and would work, but the `twilio` Python SDK is **missing from the .venv** (not listed in `pyproject.toml`). API swallows the ImportError at line 520 and returns False; notification row gets `status="delivered"` with `sms_sent_at=NULL`. UI has no signal of the failure.
- **Finding #5 (email silent skip)** — confirmed. AgentMail SDK v0.4.15 is installed but the backend code calls `inboxes.create(display_name=...)` which is now invalid. Same silent-swallow pattern.
- **Finding #6 (GitHub dev-stub)** — **NOT triggered**: real GitHub App flow works end-to-end. The 5 pre-existing projects' `github_repo_url`s all resolve to real private repos.

## New bugs surfaced

1. **Twilio Python SDK missing from dependencies.** `pyproject.toml` has no `twilio`. Install `twilio>=9` and the SMS path will work.
2. **AgentMail SDK API drift.** Code at `notification_service.py:499` uses `display_name=` kwarg that SDK 0.4.15 no longer accepts. Pin the SDK version or update the call signature.
3. **PUT /notifications/preferences 500s deterministically** on repeat. Root cause: reading `pref.updated_at`/`pref.created_at` after `db.flush()` in async session. Fix: use `await db.refresh(pref)` before serializing, or attach a `selectinload` / read the values from the request payload.
4. **Duplicate preference rows pile up.** Every failed PUT still INSERTs (the attempted INSERT commits in an outer transaction before the response-serializer fails). Once >1 row exists, subsequent GETs on prefs either fail with `MultipleResultsFound` or return an arbitrary row. Dev user currently has 5+ duplicate rows with `project_id=NULL`.
5. **Phone number not normalized to E.164** in `update_contact_info`. Stored raw. Twilio requires `+<country><number>`; SMS cannot be dialed without normalization even once SDK is installed.
6. **Onboarding assessment cost is a hardcoded formula** — `estimated_monthly_cost_usd=112.5` (from 3 agents × 18000 tokens × 30 days × $12.5/M) for `monthly_budget_usd=2500`; the submitted budget is not used in the calculation.
7. **Stale team-config**: GET /onboarding/team-config returns prior-run data without a preceding PUT. Good for verification but may mean the onboarding UI shows leftover values to users across session boundaries.

## DB state changes during Stream B

```
users.phone_number:           NULL → "2672900504" → "+12672900504"
notification_preferences:     8 rows → 12 rows (PUT-500 created 4 duplicates for dev user)
projects:                     5 → 6 (new verify-stream-b-1777001358)
notifications:                52 → 56 (4 added: B2 v1+v2, B3 v1+v2, all with sms/email_sent_at=NULL)
```
