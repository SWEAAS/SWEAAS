"""Budget endpoint tests."""


def test_budget_summary(client):
    resp = client.get("/api/v1/budget/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_monthly_budget_usd" in data
    assert "total_tokens_consumed" in data
    assert "agents" in data
    assert isinstance(data["agents"], list)


def test_budget_estimate(client):
    resp = client.post(
        "/api/v1/budget/estimate",
        json={"seat_count": 5, "monthly_budget_usd": 10000.0, "usage_profile": "balanced"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "estimated_monthly_tokens" in data
    assert "estimated_cost_usd" in data
    assert data["estimated_monthly_tokens"] > 0


def test_agent_consumption(client):
    resp = client.get("/api/v1/budget/agents/cto-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_id"] == "cto-01"
    assert "usage_percent" in data


def test_agent_consumption_not_found(client):
    resp = client.get("/api/v1/budget/agents/nonexistent")
    assert resp.status_code == 404
