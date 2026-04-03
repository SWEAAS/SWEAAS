# Backend Tests (`backend/tests/`)

Pytest is configured in root [`pyproject.toml`](../../pyproject.toml):

- `pythonpath = ["backend"]` so imports are `from app...`.
- `testpaths = ["backend/tests"]` when run from repo root.

## Run

```bash
# Unit + API tests (no external dependencies required)
pytest backend/tests -q

# Skip integration tests (default — they need a running Docker stack)
pytest backend/tests -q -m "not integration"

# Integration tests only (requires Docker stack running)
SWEAAS_INTEGRATION=1 pytest backend/tests/integration/ -v --tb=short

# Run a specific test module
pytest backend/tests/test_api/test_agents.py -v

# Run with coverage
pytest backend/tests --cov=app --cov-report=term-missing -q
```

## Architecture

```
backend/tests/
├── conftest.py              # Shared TestClient fixture, AUTH_ENFORCE_JWT=false
├── test_api/                # HTTP route tests via TestClient
│   ├── test_auth.py         # GET /auth/me
│   ├── test_agents.py       # GET/POST /agents, /agents/{id}/chat
│   ├── test_budget.py       # GET/POST /budget/*
│   ├── test_communication.py # /communication/* (email, CTO call, etc.)
│   ├── test_feedback.py     # POST /feedback, webhooks (Intercom, Canny)
│   ├── test_github_webhook.py # POST /github/webhook (HMAC verification)
│   ├── test_health.py       # GET /health
│   ├── test_notifications.py # /notifications/* (CRUD, preferences)
│   ├── test_observability.py # /observability/* (overview, Sentry issues)
│   ├── test_onboarding.py   # /onboarding/* (assess, team-config)
│   ├── test_orchestration.py # /orchestration/* (execute, sessions, reports)
│   ├── test_projects.py     # /projects/* (CRUD, config)
│   └── test_stripe_connect.py # /stripe/* (Connect, checkout, webhook)
├── test_services/           # Unit tests for service classes
│   ├── test_agent_service.py
│   ├── test_budget_service.py
│   ├── test_feedback_service.py
│   ├── test_github_service.py
│   ├── test_greptile_service.py
│   ├── test_memory_service.py
│   ├── test_notification_service.py
│   ├── test_observability_service.py
│   ├── test_orchestration_service.py
│   ├── test_report_service.py
│   ├── test_s3_service.py
│   ├── test_sandbox_service.py
│   ├── test_scheduler_service.py
│   ├── test_sentry_service.py
│   └── test_stripe_connect_service.py
├── test_agents/             # Agent orchestration tests
│   ├── test_graph.py        # Graph compilation, routing, budget gates
│   ├── test_nodes.py        # CTO/manager/aggregator node functions
│   └── test_tools.py        # Agent tool definitions and execution
└── integration/             # Integration tests (live Docker stack)
    └── test_full_pipeline.py # Multi-org end-to-end flows
```

## Test Categories

### API Route Tests (`test_api/`)

Test the full HTTP request/response cycle through the FastAPI app using `TestClient`. These verify:
- Correct status codes and response shapes
- Input validation (422 for invalid payloads)
- Authorization (401/403 for missing/invalid auth)
- Edge cases (not found, empty inputs, boundary values)

**Pattern:**
```python
def test_feature(client):
    resp = client.post("/api/v1/...", json={...})
    assert resp.status_code == 200
    assert resp.json()["field"] == "expected"
```

For routes needing DB or external services, use `app.dependency_overrides`:
```python
from app.main import app
from app.core.database import get_db

@pytest.fixture
def db_client(client):
    async def fake_db():
        yield AsyncMock()
    app.dependency_overrides[get_db] = fake_db
    yield client
    app.dependency_overrides.clear()
```

### Service Unit Tests (`test_services/`)

Test individual service classes in isolation. External dependencies (HTTP APIs, databases, SDKs) are mocked with `unittest.mock.patch` or `monkeypatch`. These verify:
- Business logic correctness
- Dev-mode fallback behavior (when API keys are empty)
- Error handling and graceful degradation
- Module-level state reset between tests

### Agent Tests (`test_agents/`)

Test the LangGraph agent orchestration with mocked LLM calls:
- Graph compilation and node connectivity
- Budget gate routing logic
- Individual node behavior (CTO decomposition, manager delegation, aggregation)
- Tool definitions and execution with mocked services

### Integration Tests (`integration/`)

Test complete user flows against a running Docker stack. Skipped by default — run with `SWEAAS_INTEGRATION=1`. These exercise:
- Full onboarding → project creation → orchestration pipeline
- Multiple organization types (solo founder, full team, edge cases)
- Webhook ingestion (GitHub, Intercom, Canny, Stripe)

## Conventions

- **Auth bypass:** `AUTH_ENFORCE_JWT=false` in `conftest.py` makes `get_current_user` return the dev user (uid=`dev-user`, email=`user@sweaas.dev`, role=`owner`)
- **No real LLM calls:** All tests mock `llm_completion` and `run_agent_with_tools`
- **No real DB required:** API and service tests mock DB sessions; only integration tests need Postgres
- **Module state cleanup:** Tests that modify module-level dicts (`_SESSIONS`, `_FEEDBACK_STORE`, `_ACTIVE_SANDBOXES`, `_alerted_agents`) use `autouse` fixtures to reset them
- **Settings cache:** When tests modify env vars, they call `get_settings.cache_clear()` to force reload

## Mocking Conventions

| Dependency | Mock Strategy |
|-----------|--------------|
| Database (get_db) | `app.dependency_overrides[get_db]` with `AsyncMock` session |
| Services (get_*_service) | `app.dependency_overrides[get_*_service]` with fake classes |
| LLM calls | `patch("app.core.llm.llm_completion")` |
| HTTP APIs (httpx) | `patch("app.services.*.httpx")` |
| Stripe SDK | `patch("stripe.Account.create")` etc. |
| E2B Sandbox | `patch("e2b.Sandbox.create")` |
| boto3 (S3) | `patch("boto3.client")` |
| ChromaDB | `patch("chromadb.HttpClient")` |
| Settings | `monkeypatch.setenv(...)` + `get_settings.cache_clear()` |

## CI Integration

```yaml
# GitHub Actions example
- name: Run unit tests
  run: |
    pip install -e ".[dev]"
    pytest backend/tests -q --tb=short -m "not integration"

- name: Run integration tests
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: |
    docker compose up -d
    sleep 10
    SWEAAS_INTEGRATION=1 pytest backend/tests/integration/ -v --tb=short
    docker compose down
```

## Adding Tests

### New route
1. Add `test_<feature>.py` in `test_api/`
2. Use `client` fixture for simple routes; create `*_client` fixture with dependency overrides for routes needing DB/services
3. Test happy path, validation errors, and edge cases

### New service
1. Add `test_<service>.py` in `test_services/`
2. Mock all external dependencies
3. Test dev-mode fallbacks (empty API keys)
4. Reset any module-level state in an `autouse` fixture

### New agent node/tool
1. Add tests in `test_agents/`
2. Mock `llm_completion` and `llm_has_credentials`
3. Test both LLM-available and fallback paths
