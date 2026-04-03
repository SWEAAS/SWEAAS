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


def test_checkout_session(client):
    """Test POST /budget/checkout with mocked Stripe."""
    from unittest.mock import AsyncMock, patch
    from app.schemas.budget_schema import StripeCheckoutResponse

    mock_response = StripeCheckoutResponse(
        checkout_url="https://checkout.stripe.com/pay/123", session_id="cs_test_abc",
    )
    with patch(
        "app.services.budget_service.BudgetService.create_checkout_session",
        new_callable=AsyncMock,
        return_value=mock_response,
    ):
        resp = client.post(
            "/api/v1/budget/checkout?project_id=proj-001&price_id=price_123",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["checkout_url"].startswith("https://")
        assert data["session_id"] == "cs_test_abc"


def test_budget_webhook_no_secret(client, monkeypatch):
    """When STRIPE_WEBHOOK_SECRET is not configured, webhook returns without verifying."""
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        resp = client.post(
            "/api/v1/budget/webhook",
            content=b'{"type": "checkout.session.completed"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
    finally:
        get_settings.cache_clear()


def test_budget_estimate_light_profile(client):
    resp = client.post(
        "/api/v1/budget/estimate",
        json={"seat_count": 10, "monthly_budget_usd": 20000.0, "usage_profile": "light"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["estimated_monthly_tokens"] > 0


def test_budget_estimate_heavy_profile(client):
    resp = client.post(
        "/api/v1/budget/estimate",
        json={"seat_count": 2, "monthly_budget_usd": 3000.0, "usage_profile": "heavy"},
    )
    assert resp.status_code == 200
    assert resp.json()["estimated_cost_usd"] > 0


def test_budget_estimate_invalid_seat_count(client):
    resp = client.post(
        "/api/v1/budget/estimate",
        json={"seat_count": 0, "monthly_budget_usd": 5000.0},
    )
    assert resp.status_code == 422


def test_budget_estimate_negative_budget(client):
    resp = client.post(
        "/api/v1/budget/estimate",
        json={"seat_count": 5, "monthly_budget_usd": -100.0},
    )
    assert resp.status_code == 422
