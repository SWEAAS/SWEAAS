"""Onboarding endpoint tests."""


def test_list_departments(client):
    resp = client.get("/api/v1/onboarding/departments")
    assert resp.status_code == 200
    departments = resp.json()
    assert isinstance(departments, list)
    assert len(departments) == 4
    keys = [d["key"] for d in departments]
    assert "engineering" in keys


def test_assess(client):
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
