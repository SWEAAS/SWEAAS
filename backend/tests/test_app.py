from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_endpoint() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "SWEAAS backend is running."


def test_budget_summary_endpoint() -> None:
    response = client.get("/api/v1/budgets/summary")

    assert response.status_code == 200
    assert "agents" in response.json()


def test_onboarding_assessment_endpoint() -> None:
    response = client.post(
        "/api/v1/onboarding/assess",
        json={
            "company_name": "Acme Corp",
            "team_size": 24,
            "monthly_budget_usd": 4000,
            "contact_email": "ops@example.com",
            "needs_onboarding_call": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["company_name"] == "Acme Corp"
