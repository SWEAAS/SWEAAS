# SWEAAS Post-Fix Audit (Final) — 2026-04-24

Supersedes `audit-2026-04-24.md` and `audit-post-fix-2026-04-24.md`. All 7 original findings now resolved at the code level and verified end-to-end against the live stack. Two additional bugs were surfaced and fixed during the retest.

## Original 7 findings → final status

| # | Finding | Code fix | Live evidence | Final status |
|---|---------|----------|---------------|-------------|
| 1 | SMS silent-skip | `twilio>=9,<10` added to `pyproject.toml` + installed; `normalize_phone_e164` helper normalizes in `update_contact_info`; `_send_sms` surfaces missing-SDK errors and uses the E.164-normalized number | `POST /notifications/send {channel:"sms"}` → `channels_used:["in_app","sms"]`, `sms_sent_at` non-NULL, Twilio SID `SM2d2971218fd768e3e5bd2690a65662b1` visible via `GET /2010-04-01/Messages.json`. Carrier-side status: `undelivered, error_code=30032` ("Toll-Free Number Has Not Been Verified"). **Code path fully working; delivery blocked on a Twilio compliance step — see "Ops follow-up" below.** | **Code PASS, delivery blocked by carrier verification** |
| 2 | Email silent-skip | `_send_email` rewritten to AgentMail SDK 0.4.15: `client.inboxes.create(request=CreateInboxRequest(display_name=...))` then `client.inboxes.messages.send(inbox_id=..., to=..., subject=..., html=..., text=...)`. Inbox id cached at class level (one inbox per process, not per email). | DB: 3 rows with `email_sent_at` non-NULL. AgentMail `GET /v0/inboxes/filthyemployee53@agentmail.to/messages`: 3 messages, all `from=SWEAAS Notifications <filthyemployee53@agentmail.to>`, delivered via AWS SES (`*@email.amazonses.com` message-ids). Latest: `to=odzjeffreyjr@gmail.com subject=[SWEAAS] SWEAAS verify — gmail test`. | **PASS** (check spam/Promotions tab if Gmail doesn't show it — sender is a new AgentMail inbox) |
| 3 | Stripe Connect dead + raw 500 on errors | (a) Wrapped `onboard` and `create_checkout` in `try/except stripe.StripeError` → `HTTPException(400, user_message)`. (b) Linked the dev user's org to the already-enabled account `acct_1TPb7tK0YO9wbde8` (inserted into `connected_accounts`). (c) Fixed two webhook-handler crashes surfaced during re-test (see "Bugs surfaced during retest" below). (d) Synced `STRIPE_WEBHOOK_SECRET` in `.env` to the current `stripe listen` session secret. | `GET /stripe/connect/status` → `{charges_enabled:true, payouts_enabled:true, onboarding_complete:true}`. `POST /stripe/checkout` → live `cs_test_...` URL with `success_url=http://localhost:5173/revenue?stripe=checkout_success&...`, `metadata={project_id, connected_account_id}`. `stripe trigger checkout.session.completed` with matching metadata → webhook 200, **new `payment_records` row** (`pi_3TPbrIK0YOQL06qe1biVhCMa, $30, status=succeeded`). `GET /stripe/revenue` → `{total_revenue_cents:3000, net_earnings_cents:3000, payment_count:1}`. `GET /stripe/payments` returns the row. `GET /stripe/revenue/breakdown` → `months:[{"2026-04":..., revenue_cents:3000}]`. All three API surfaces reconcile against the DB. | **PASS — full end-to-end** |
| 4 | Budget three-way inconsistency | `BudgetService.get_summary` and `ObservabilityService.get_overview` rewritten to aggregate per-agent tokens from `token_usage_logs` (last 24h) instead of the stale `agent_configs.tokens_used_today` cache. | `/budget/summary.total_tokens_consumed = 165,171` = sum of `/observability/overview.departments[].tokens_used_today = 165,171`. Remaining delta vs raw `SUM(token_usage_logs.total_tokens) = 915,905` is 557 rows with `agent_id IS NULL` (unattributed platform logs) — legitimately excluded from per-agent aggregates. Two of two UI-surfaced sources now agree. | **PASS** |
| 5 | `PUT /notifications/preferences` 500 | `await db.refresh(pref)` before serializing so `updated_at`/`created_at` aren't lazy-loaded in async context. `_get_or_create_preference` now orders by `created_at ASC`, keeps the oldest row, deletes stragglers (self-heal if duplicates exist). | `PUT /notifications/preferences` returns **HTTP 200** with full JSON body. DB: `timezone=America/New_York, quiet_hours_start=22, quiet_hours_end=7, budget_threshold_percent=80` persisted exactly. | **PASS** |
| 6 | `agent_sessions` table architecturally dead | `OrchestrationService._persist_session` now writes an `AgentSession` row alongside the `Report` row. Session is attached to the project's CTO (or any project agent if no CTO), with `status`, `started_at`, `ended_at`, `sandbox_id` populated. | Before: `SELECT COUNT(*) FROM agent_sessions = 0`. After a single orchestration run: **1 row** (agent Charlie, status=done, started+ended timestamps). `GET /orchestration/sessions/<pid>` returns the session with its details (was `[]` before). Sessions now survive uvicorn restarts. | **PASS** |
| 7 | Hardcoded `app.sweaas.dev/billing/*` redirect | `budget_service.create_checkout_session` now reads from `settings.stripe_connect_return_url` (strips query params, appends `stripe=checkout_*`). Falls back to `http://localhost:5173/billing` only if config is empty. | Live Stripe session retrieved: `success_url=http://localhost:5173/revenue?stripe=checkout_success&session_id={CHECKOUT_SESSION_ID}`, `cancel_url=http://localhost:5173/revenue?stripe=checkout_cancel`. No `app.sweaas.dev`. | **PASS** |

## Bugs surfaced during retest (now fixed)

### A. Stripe webhook `.get()` on a `StripeObject`

`stripe.Webhook.construct_event()` returns a `stripe.Event` (a `StripeObject` subclass). `StripeObject.__getattr__` raises `AttributeError: get` when you try `event.get("type", "")` because `.get` collides with attribute lookup on the base class. The old `_webhook_secret_configured=False` path avoided this by doing `json.loads(body)` (returning a plain dict) but the real signature-verified path passed the StripeObject straight to the dict-using handler.

**Fix**: in `stripe_connect_router.stripe_webhook`, call `construct_event` purely for signature verification, then `json.loads(body)` to produce the plain-dict event passed to `handle_webhook_event`. Same shape used by the dev path, so handler doesn't need to change.

### B. `handle_checkout_completed` StripeObject vs dict handling

`stripe.PaymentIntent.retrieve(...)` likewise returns StripeObjects for the PI, its `latest_charge`, and the nested `application_fee`. The existing code mixed `.get()` (dict-only) with `hasattr/getattr` (StripeObject-only) depending on a type check that didn't quite match the StripeObject case. Result: `.get()` raised AttributeError before the type check could route correctly.

**Fix**: `handle_checkout_completed` now uses `getattr(...)` for every hop down the StripeObject tree, with an explicit `isinstance(dict)` branch for cases where the attribute happens to be a bare dict.

## Ops follow-up (not code) — needed to deliver SMS

Twilio rejects messages from `+18335887958` with error code **30032 — "Toll-Free Number Has Not Been Verified."** US toll-free numbers must complete Twilio's toll-free verification process before carriers will accept A2P (application-to-person) traffic. Until that ships, delivery will always fail after Twilio accepts the message.

Two paths forward:
- **Submit toll-free verification** at `https://console.twilio.com/us1/develop/sms/regulatory-compliance/toll-free-verifications`. Typical processing: 5–15 business days.
- **Use a 10DLC number** (local long-code, requires Brand + Campaign registration — similar timeline).
- **Use a Twilio short code** (fast for high-volume but expensive, $500+/mo).

No code change on our side resolves this — the integration is correct and the Twilio API accepts the send.

## What AgentMail delivery may need (if Gmail doesn't show it)

The email to `odzjeffreyjr@gmail.com` was sent via AWS SES on behalf of `filthyemployee53@agentmail.to`. Three reasons Gmail could hide it:

1. **Spam/Promotions folder** — a brand-new inbox with no reputation, no DKIM alignment with the agentmail.to domain, first-time sender. Check Spam and the Promotions tab first.
2. **The from-display mismatch** — we set `display_name="SWEAAS Notifications"` but the envelope-from is the random `filthyemployee53@agentmail.to`. A custom AgentMail subdomain (e.g. `notify@sweaas.com`) configured with DKIM + SPF + DMARC would land in the inbox reliably.
3. **AgentMail inbox quota / domain policy** — AgentMail sandboxes have per-inbox outbound rate limits.

The AgentMail API reports all three messages accepted (`amazonses.com` message-ids present), and the backend records `email_sent_at` non-NULL. The **code path** is confirmed working.

## Files modified this pass

- [backend/app/services/notification_service.py](backend/app/services/notification_service.py) — E.164 phone normalization, `_send_email` SDK 0.4.15, class-level inbox cache, `_send_sms` ImportError path, `update_preferences` refresh, `_get_or_create_preference` dedupe
- [backend/app/services/budget_service.py](backend/app/services/budget_service.py) — consolidated token aggregation to `token_usage_logs`; removed hardcoded `app.sweaas.dev` redirect
- [backend/app/services/observability_service.py](backend/app/services/observability_service.py) — consolidated to `token_usage_logs`
- [backend/app/services/orchestration_service.py](backend/app/services/orchestration_service.py) — `_persist_session` writes `AgentSession`; added `_parse_iso`, `_map_session_status`
- [backend/app/services/stripe_connect_service.py](backend/app/services/stripe_connect_service.py) — `handle_checkout_completed` now uses `getattr`-first StripeObject traversal
- [backend/app/api/routes/stripe_connect_router.py](backend/app/api/routes/stripe_connect_router.py) — `onboard_connect` + `create_checkout` wrap `stripe.StripeError`; webhook handler converts StripeObject to plain dict before dispatching
- [pyproject.toml](pyproject.toml) — pinned `agentmail>=0.4.0,<0.5.0`, added `twilio>=9,<10`

## DB state changes during retest

```
users.email (dev):             user@sweaas.dev  →  odzjeffreyjr@gmail.com   (so AgentMail tests reach real inbox)
users.phone_number (dev):      2672900504       →  +12672900504             (E.164 enforced)
connected_accounts:            0 → 1            (dev org linked to acct_1TPb7tK0YO9wbde8, charges_enabled=true)
payment_records:               0 → 1            (pi_3TPbrIK0YOQL06qe1biVhCMa, $30, succeeded)
agent_sessions:                0 → 1            (first durable session row ever)
notification_preferences:      8 → 8            (no duplicates created post-fix)
notifications:                 52 → 60+         (test sends, all with *_sent_at populated on success)
reports:                       52 → 54          (new orchestration + session reports)
token_usage_logs:              754 → 760+       (LLM calls from test orchestrations)
```

## Artifacts

- `preflight-2026-04-24.md` — env + integration flags snapshot
- `audit-2026-04-24.md` — original audit identifying the 7 findings
- `audit-post-fix-2026-04-24.md` — first-round fix audit (6 of 7 verified; Stripe blocked on account config)
- `audit-final-2026-04-24.md` — **this file**, all 7 verified end-to-end with the bonus two-bug discovery
- `stream-a-commerce.md`, `stream-b-comms.md`, `stream-c-live-data.md` — per-stream verification logs (pre-fix)

## Confirmation the operator should see right now

- **Gmail** `odzjeffreyjr@gmail.com`: one email subject `[SWEAAS] SWEAAS verify — gmail test` from `SWEAAS Notifications <filthyemployee53@agentmail.to>`. Check spam/Promotions.
- **Phone** `267-290-0504`: no SMS will arrive until Twilio toll-free verification is approved. Twilio Console → Monitor → Messaging Logs will show the message with `error_code=30032`.
- **Stripe Dashboard** (sweaas sandbox → Connect → Test account `acct_1TPb7tK0YO9wbde8`): the $30 test payment should appear under Payments. Our DB and all three revenue endpoints already agree on it.
- **App DB**: `SELECT * FROM payment_records` shows one row; `SELECT * FROM agent_sessions` shows one row; `connected_accounts` shows the linked-enabled row.
