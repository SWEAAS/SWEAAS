# Package `app` — SWEAAS FastAPI application

This directory is the **Python package** imported as `app` (e.g. `from app.main import app`).

## Layers (dependency direction)

```
routes/  →  services/  →  models/, external SDKs (Stripe, httpx, Chroma, E2B)
    ↓
schemas/  (Pydantic — request/validation and response shapes)
    ↓
middleware/auth.py  →  services (user context injected per route)
```

- **`api/routes/`** — Thin: parse input, call service, map exceptions to HTTP.  
- **`services/`** — Domain logic; **no** FastAPI imports.  
- **`agents/`** — LangGraph graph, nodes, LangChain tools, prompt loading from `vendor/agency-agents` (cloned locally; path resolved in `agents/prompts/role_loader.py`).  
- **`models/`** — SQLAlchemy tables; use with async sessions from `core/database.py`.  

## Key constants

- **Customer-facing chat agent ID:** `sup-cs-01` (see `services/agent_service.py` — `CUSTOMER_SUPPORT_AGENT_ID`).  
- **Feedback:** `services/feedback_service.py` (in-memory store in dev; replace with DB in production).  

## Do not

- Import `routes` from `services`.  
- Put LLM calls directly in `routes` — keep them in `services/` or `agents/nodes/`.  

Parent documentation: [`../README.md`](../README.md).
