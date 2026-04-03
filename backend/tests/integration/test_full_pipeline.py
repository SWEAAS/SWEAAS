"""Integration tests — exercise full pipelines against a running Docker stack.

Prerequisites:
    docker compose up -d
    alembic upgrade head   (from backend/)

Run with:
    pytest backend/tests/integration/ -q --tb=short -m integration

These tests are skipped by default (CI) unless SWEAAS_INTEGRATION=1 is set.
"""

import os
import pytest
import httpx

BASE_URL = os.getenv("SWEAAS_API_URL", "http://localhost:8000/api/v1")

pytestmark = pytest.mark.skipif(
    os.getenv("SWEAAS_INTEGRATION") != "1",
    reason="Set SWEAAS_INTEGRATION=1 to run integration tests against a live stack",
)


@pytest.fixture(scope="module")
def api():
    """Provide an httpx client pointed at the running backend."""
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        yield client


# ──────────────────────────────────────────────────────────────────
# Health
# ──────────────────────────────────────────────────────────────────

class TestHealth:
    def test_root(self, api):
        r = api.get("http://localhost:8000/")
        assert r.status_code == 200
        assert "SWEAAS" in r.json()["message"]

    def test_health_endpoint(self, api):
        r = api.get("/health")
        assert r.status_code == 200
        assert r.json()["message"] == "ok"


# ──────────────────────────────────────────────────────────────────
# Org A: Solo founder, engineering-only, $2K/mo
# ──────────────────────────────────────────────────────────────────

class TestOrgASoloFounder:
    """End-to-end flow for a solo founder with a small budget."""

    def test_01_assess(self, api):
        r = api.post("/onboarding/assess", json={
            "company_name": "Solo Startup",
            "team_size": 1,
            "monthly_budget_usd": 2000.0,
            "contact_email": "solo@example.com",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["company_name"] == "Solo Startup"
        assert data["estimated_agent_count"] >= 1
        assert data["estimated_monthly_cost_usd"] <= 2000.0

    def test_02_contact(self, api):
        r = api.post("/onboarding/contact", json={
            "contact_email": "solo@example.com",
            "calendar_email": "solo@example.com",
            "preferred_timeframe": "afternoon",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "received"

    def test_03_departments(self, api):
        r = api.get("/onboarding/departments")
        assert r.status_code == 200
        keys = [d["key"] for d in r.json()]
        assert "engineering" in keys

    def test_04_budget_estimate(self, api):
        r = api.post("/budget/estimate", json={
            "seat_count": 1,
            "monthly_budget_usd": 2000.0,
            "usage_profile": "light",
        })
        assert r.status_code == 200
        assert r.json()["estimated_cost_usd"] > 0

    def test_05_budget_summary(self, api):
        r = api.get("/budget/summary")
        assert r.status_code == 200
        data = r.json()
        assert "agents" in data
        assert len(data["agents"]) > 0

    def test_06_list_agents(self, api):
        r = api.get("/agents")
        assert r.status_code == 200
        agents = r.json()
        assert len(agents) >= 12

    def test_07_get_cto_agent(self, api):
        r = api.get("/agents/cto-01")
        assert r.status_code == 200
        assert r.json()["hierarchy_level"] == "cto"

    def test_08_submit_feedback(self, api):
        r = api.post("/feedback", json={
            "title": "Need dark mode",
            "body": "The dashboard is too bright at night.",
            "category": "feature",
            "source": "in_app",
        })
        assert r.status_code == 201
        assert r.json()["feedback_id"].startswith("fb-")

    def test_09_list_feedback(self, api):
        r = api.get("/feedback")
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_10_observability_overview(self, api):
        r = api.get("/observability/overview")
        assert r.status_code == 200
        assert r.json()["total_active_agents"] > 0

    def test_11_observability_reports(self, api):
        r = api.get("/observability/reports")
        assert r.status_code == 200
        assert isinstance(r.json()["reports"], list)


# ──────────────────────────────────────────────────────────────────
# Org B: Small team, full departments, $10K/mo
# ──────────────────────────────────────────────────────────────────

class TestOrgBFullDepartments:
    """Full department setup with a larger budget."""

    def test_01_assess(self, api):
        r = api.post("/onboarding/assess", json={
            "company_name": "GrowthCo",
            "team_size": 25,
            "monthly_budget_usd": 10000.0,
            "contact_email": "admin@growthco.com",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["estimated_agent_count"] >= 3
        depts = [d["key"] for d in data["recommended_departments"]]
        assert "engineering" in depts

    def test_02_budget_estimate_balanced(self, api):
        r = api.post("/budget/estimate", json={
            "seat_count": 25,
            "monthly_budget_usd": 10000.0,
            "usage_profile": "balanced",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["estimated_cost_usd"] <= 10000.0

    def test_03_team_config_save(self, api):
        r = api.put("/onboarding/team-config", json={
            "company_size": 25,
            "overall_budget_usd": 10000,
            "department_sizes": {"engineering": 10, "marketing": 5, "product": 5, "support": 5},
            "assignments": [],
        })
        assert r.status_code == 200
        assert r.json()["completed"] is True

    def test_04_team_config_get(self, api):
        r = api.get("/onboarding/team-config")
        assert r.status_code == 200
        assert r.json()["company_size"] == 25

    def test_05_auth_me(self, api):
        r = api.get("/auth/me")
        assert r.status_code == 200
        assert r.json()["uid"] == "dev-user"


# ──────────────────────────────────────────────────────────────────
# Org C: Edge case — zero/minimal budget
# ──────────────────────────────────────────────────────────────────

class TestOrgCEdgeCases:
    """Edge cases: validation boundaries."""

    def test_assess_minimum_budget(self, api):
        r = api.post("/onboarding/assess", json={
            "company_name": "Tiny Co",
            "team_size": 1,
            "monthly_budget_usd": 1.0,
            "contact_email": "tiny@example.com",
        })
        assert r.status_code == 200
        assert r.json()["estimated_agent_count"] >= 1

    def test_assess_missing_required_fields(self, api):
        r = api.post("/onboarding/assess", json={})
        assert r.status_code == 422

    def test_budget_estimate_zero_seats(self, api):
        r = api.post("/budget/estimate", json={
            "seat_count": 0,
            "monthly_budget_usd": 5000.0,
        })
        assert r.status_code == 422

    def test_get_nonexistent_agent(self, api):
        r = api.get("/agents/does-not-exist")
        assert r.status_code == 404

    def test_github_webhook_ping(self, api):
        r = api.post("/github/webhook", json={"zen": "Integration test"}, headers={"X-GitHub-Event": "ping"})
        assert r.status_code == 200
        assert r.json()["status"] == "pong"

    def test_feedback_webhook_intercom(self, api):
        r = api.post("/feedback/webhooks/intercom", json={
            "title": "Intercom ticket",
            "body": "User reported error",
            "project_id": "p-integ",
        })
        assert r.status_code == 200

    def test_feedback_webhook_canny(self, api):
        r = api.post("/feedback/webhooks/canny", json={
            "title": "Canny feature request",
            "body": "Want SSO support",
        })
        assert r.status_code == 200


# ──────────────────────────────────────────────────────────────────
# Communication (non-Tavus routes)
# ──────────────────────────────────────────────────────────────────

class TestCommunication:
    def test_cto_context(self, api):
        r = api.get("/communication/cto-context")
        assert r.status_code == 200
        data = r.json()
        assert "agents" in data
        assert "total_token_pct" in data

    def test_public_customer_call_no_token(self, api):
        r = api.post("/communication/customer-call/public", json={"topic": "Help"})
        assert r.status_code == 401
