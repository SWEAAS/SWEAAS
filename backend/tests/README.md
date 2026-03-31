# Backend tests (`backend/tests/`)

Pytest is configured in root [`pyproject.toml`](../../pyproject.toml):

- `pythonpath = ["backend"]` so imports are `from app...`.
- `testpaths = ["backend/tests"]` when run from repo root.

## Run

```bash
# From repo root (recommended)
pytest backend/tests -q

# Or from backend/ with PYTHONPATH
cd backend && PYTHONPATH=. pytest tests -q
```

## Layout

| Path | Purpose |
|------|---------|
| `conftest.py` | Shared `TestClient` fixture |
| `test_api/` | HTTP integration tests against the full app |
| `test_services/` | Unit tests for pure service functions |
| `test_agents/` | Agent helpers (e.g. role loader) |

## Conventions

- Prefer testing **public API** behavior (`test_api`) for routes.  
- Use **real** `TestClient` against `app.main:app` — no mocks unless testing a pure function.  
- Auth: with empty `SUPABASE_JWT_SECRET`, middleware runs in **dev user** mode (no Bearer required).  

## Adding tests for a new route

1. Add `test_<feature>.py` under `test_api/`.  
2. Call `client.post("/api/v1/...", json={...})` and assert status + JSON shape.  
3. Document any required env vars at the top of the test file.  
