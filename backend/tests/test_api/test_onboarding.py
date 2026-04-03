"""Onboarding endpoint tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.main import app
from app.core.database import get_db


ORG_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def db_client(client):
    """Client with mocked DB so routes needing the database work without Postgres."""
    session = AsyncMock()

    async def always_resolve_org(stmt):
        mock = MagicMock()
        mock.scalar_one_or_none.return_value = ORG_ID
        return mock

    session.execute = always_resolve_org
    session.commit = AsyncMock()
    session.add = MagicMock()

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    yield client
    app.dependency_overrides.clear()


def test_list_departments(client):
    resp = client.get("/api/v1/onboarding/departments")
    assert resp.status_code == 200
    departments = resp.json()
    assert isinstance(departments, list)
    assert len(departments) == 4
    keys = [d["key"] for d in departments]
    assert "engineering" in keys


def test_assess(client):
    """Assess route uses DB to look up user by email; mock returns None to skip user logic."""
    session = AsyncMock()

    async def return_none(stmt):
        mock = MagicMock()
        mock.scalar_one_or_none.return_value = None
        return mock

    session.execute = return_none
    session.commit = AsyncMock()
    session.add = MagicMock()

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = client.post(
            "/api/v1/onboarding/assess",
            json={
                "company_name": "Test Corp",
                "team_size": 20,
                "monthly_budget_usd": 5000.0,
                "contact_email": "test@example.com",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Test Corp"
        assert "estimated_agent_count" in data
        assert "estimated_monthly_cost_usd" in data
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_capture_contact(client):
    resp = client.post(
        "/api/v1/onboarding/contact",
        json={
            "contact_email": "test@example.com",
            "calendar_email": "cal@example.com",
            "preferred_timeframe": "morning",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "received"


def test_team_config_get(db_client):
    """GET /team-config returns default empty config for dev user's org."""
    resp = db_client.get("/api/v1/onboarding/team-config")
    assert resp.status_code == 200
    data = resp.json()
    assert "completed" in data
    assert "assignments" in data


def test_team_config_save_and_get(db_client):
    """PUT /team-config saves config, then GET retrieves it."""
    config = {
        "company_size": 50,
        "overall_budget_usd": 5000,
        "department_sizes": {"engineering": 5, "marketing": 2, "product": 2, "support": 1},
        "cto_assignment": {
            "agent_id": "cto-01",
            "replica_id": "r-cto",
            "replica_name": "Luna",
            "model_name": "phoenix-4",
        },
        "assignments": [],
    }
    resp = db_client.put("/api/v1/onboarding/team-config", json=config)
    assert resp.status_code == 200
    data = resp.json()
    assert data["completed"] is True
    assert data["company_size"] == 50

    resp2 = db_client.get("/api/v1/onboarding/team-config")
    assert resp2.status_code == 200
    assert resp2.json()["company_size"] == 50


def test_team_config_patch_cto(db_client):
    """PATCH /team-config/cto updates only the CTO assignment."""
    db_client.put(
        "/api/v1/onboarding/team-config",
        json={
            "company_size": 30,
            "overall_budget_usd": 3000,
            "assignments": [],
        },
    )
    resp = db_client.patch(
        "/api/v1/onboarding/team-config/cto",
        json={
            "cto_assignment": {
                "agent_id": "cto-01",
                "replica_id": "r-new-cto",
                "replica_name": "New CTO",
                "model_name": "phoenix-5",
            }
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cto_assignment"]["replica_id"] == "r-new-cto"
