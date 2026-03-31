# Prompts and AI-assisted development on SWEAAS

Use this document together with the root [README](../README.md) whenever you open a new Cursor chat or external LLM session. Paste sections below into your system or user prompt so the model stays aligned with this codebase.

## What SWEAAS is (one paragraph)

SWEAAS is **SWE as a Service**: a FastAPI backend plus React/Vite/Three.js frontend. AI agents are organized in a hierarchy (CTO → department managers → specialists). **Product users** talk to the **Customer Support** agent; **owners** talk to the **CTO** and engineering agents. User feedback is collected via `/api/v1/feedback` and optional webhooks (Intercom, Canny). Sandboxed execution uses E2B; memory uses ChromaDB; billing uses LiteLLM + Stripe.

## Ground rules for codegen

1. **API-first:** New features are added as FastAPI routes + Pydantic schemas + services. The frontend calls `/api/v1/...` only (see `frontend/src/api/client.ts`).
2. **No cross-imports** between frontend and backend Python code.
3. **Agent IDs:** Internal engineering chat uses agents like `eng-fe-01`. **End-user product chat** uses **`sup-cs-01`** (Customer Support). Document this in any UI that exposes chat.
4. **Secrets:** Never commit `.env`. Copy from `.env.example`.
5. **Vendor repos** (`vendor/agency-agents`, `vendor/nemoclaw`) are gitignored; clone locally per root README.

## Prompt templates you can reuse

### Add a new API endpoint

> Read `backend/app/api/router.py` and an existing route file under `backend/app/api/routes/`. Add a new router or route: Pydantic schema in `backend/app/schemas/`, service method in `backend/app/services/`, register dependency in `backend/app/core/dependencies.py`, include router in `router.py`. Add a test under `backend/tests/test_api/`. Extend `frontend/src/api/client.ts` if the UI needs it.

### Add a new integration

> Follow “Adding New Integrations” in the root README: `config.py`, `.env.example`, service, schema, router, dependency, tests.

### Work on customer / feedback features

> User feedback: `POST /api/v1/feedback`, `GET /api/v1/feedback`, webhooks `POST /api/v1/feedback/webhooks/intercom` and `.../canny`. Customer **video**: `POST /api/v1/communication/customer-call`. Customer **chat**: `POST /api/v1/agents/sup-cs-01/chat`. See `backend/app/services/feedback_service.py` and `communication_service.create_customer_support_call`.

### Frontend / 3D HQ

> App entry `frontend/src/App.tsx`. Dashboard `frontend/src/views/DashboardView.tsx`. 3D office `frontend/src/three/HQView.tsx`. Theme tokens in `frontend/src/styles/globals.css`.

## Files to mention in prompts for full context

- **Routing:** `backend/app/api/router.py`
- **Agents & graph:** `backend/app/agents/graph.py`, `backend/app/services/seed_data.py`
- **Auth:** `backend/app/api/middleware/auth.py`
- **Env:** `.env.example`

## OpenAPI

With the backend running, OpenAPI JSON is at `/openapi.json` and Swagger UI at `/docs`. Use these to regenerate or verify client types.
