# SWEAAS Verification Preflight — 2026-04-24

## Stack target

Verification runs against the **existing live local stack**, not a fresh docker compose:

- **Backend:** bare-metal `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend` running from `/Users/jeffreyoduman/SWEAAS/.venv` (PID 76478). Reads shared `/Users/jeffreyoduman/SWEAAS/.env`.
- **Frontend:** Vite dev server on `http://localhost:5173` (PID 89551, from sibling worktree `nostalgic-noether-5d2461` — same codebase).
- **Postgres:** Docker container `gallant-pascal-4547f4-postgres-1` on `localhost:5432`, db `sweaas`, user `sweaas`.
- **Redis:** `gallant-pascal-4547f4-redis-1` on `:6379`.
- **ChromaDB:** `gallant-pascal-4547f4-chromadb-1` on `:8100`.
- `/Users/jeffreyoduman/SWEAAS/.claude/worktrees/hungry-mcnulty-ef90f5/.env` → symlink → `/Users/jeffreyoduman/SWEAAS/.env`
- `./github-app-key.pem` resolves to `/Users/jeffreyoduman/SWEAAS/github-app-key.pem` (present).

Rationale for reusing the running stack: it's already warm, the Postgres has 754 token-usage rows and 52 reports of real history to cross-check, and it's reading the same shared `.env` with real keys. Starting a fresh compose would collide on ports 5432/6379/8100.

### Prod

`https://api.sweaas.com/api/v1/health` → **503** at verification start. Phase 2 prod re-run is deferred until ECS is back.

## Integration flag matrix

Every integration that affects this verification is configured with real (test-mode where relevant) credentials. No THEATER steps on preflight grounds.

```json
{
  "agentmail_api_key": true,
  "auth_enforce_jwt": false,
  "aws_region": true,
  "github_app_id": true,
  "github_app_private_key_path": true,
  "github_org_name": true,
  "llm_default_model": "xai/grok-4-1-fast-reasoning",
  "openai_api_key": true,
  "s3_bucket_name": true,
  "sentry_auth_token": true,
  "stripe_secret_key": true,
  "stripe_webhook_secret": true,
  "supabase_url": true,
  "tavus_api_key": true,
  "twilio_account_sid": true,
  "twilio_auth_token": true,
  "twilio_from_number": true,
  "xai_api_key": true
}
```

Stripe is **test mode** (`sk_test_...`). Twilio is live creds — SMS to `+12672900504` will actually be sent.

## Baseline DB row counts (pre-verification)

```
 agent_configs            |  34
 agent_sessions           |   0     ← suspicious; reports=52 but no sessions persisted
 budget_allocations       |   5
 connected_accounts       |   0     ← commerce starts clean
 notification_preferences |   8
 notifications            |  52
 organization_members     |   4
 organizations            |   4
 payment_records          |   0
 payout_records           |   0
 projects                 |   5
 replica_profiles         |  86
 reports                  |  52
 tasks                    |   0     ← tasks table never written to
 token_usage_logs         | 754
 users                    |   3
```

Pre-existing users:
- `user@sweaas.dev` / uid `dev-user` / org `Bright Labs` — no phone, no github_username.
- 2 e2e test users (from prior verification runs), no phone or github.

Pre-existing projects (all org `8e871597-...`):
- `e2e-final-97073`, `verify-e2e-69785`, `beta-launch`, `supabase-e2e-project`, `e2e-test-project`
- All have `github_repo_url: https://github.com/SWEAAS/project-<slug>` — **these need B5 verification** (does the repo actually exist, or is this the dev-stub URL?).

## Findings that persist from plan

Still applicable regardless of the live-stack swap:
1. Dev-stack swap does NOT eliminate **silent SMS skip** if Twilio unset — but Twilio IS set, so we'll get real delivery (B2).
2. **GitHub dev-stub** — creds are set, so real GitHub API calls will happen. The 5 existing projects give us a quick early probe: `curl -sI <their github_repo_url>` must return 200; if they 404, even with creds set there's a deeper bug.
3. **Budget dual-source** — still applicable. A9 cross-check remains valid.
4. **app.sweaas.dev redirect** — still hardcoded; A4 expectation unchanged.
5. **Orchestration stub on ImportError** — `agent_sessions = 0` despite 52 reports is a loud hint that sessions aren't persisted end-to-end. C10 will hit this.

## Evidence artifacts created this run

- `e2e-verification/preflight-2026-04-24.md` — this file
- `e2e-verification/audit-2026-04-24.md` — final result table (to be written in Phase 3)
- `e2e-verification/stream-a-commerce.md`, `stream-b-comms.md`, `stream-c-live-data.md` — per-stream logs
- `e2e-verification/db-snapshots/` — pre and post SELECT dumps
- `e2e-verification/curl-logs/` — API call log
- `e2e-verification/screenshots/` — browser screenshots per page
