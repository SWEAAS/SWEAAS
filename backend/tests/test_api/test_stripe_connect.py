"""Stripe Connect endpoint tests."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.main import app
from app.core.dependencies import get_stripe_connect_service
from app.core.database import get_db


class FakeUser:
    def __init__(self):
        self.id = "00000000-0000-0000-0000-000000000099"
        self.supabase_uid = "dev-user"
        self.email = "user@sweaas.dev"
        self.organization_id = "00000000-0000-0000-0000-000000000001"


class FakeConnectedAccount:
    stripe_account_id = "acct_test123"
    id = "ca-001"
    charges_enabled = True


class FakeStripeConnectService:
    async def create_connected_account(self, org_id, email, db):
        from app.schemas.stripe_schema import ConnectOnboardResponse
        return ConnectOnboardResponse(account_link_url="https://connect.stripe.com/setup/123")

    async def get_onboarding_status(self, org_id, db):
        from app.schemas.stripe_schema import ConnectStatusResponse
        return ConnectStatusResponse(stripe_account_id="acct_test123", onboarding_complete=True, charges_enabled=True, payouts_enabled=True)

    async def create_account_link(self, org_id, db):
        from app.schemas.stripe_schema import ConnectOnboardResponse
        return ConnectOnboardResponse(account_link_url="https://connect.stripe.com/setup/456")

    async def create_checkout_session(self, project_id, price_id, connected_account_id, stripe_account_id, db):
        from app.schemas.stripe_schema import CheckoutResponse
        return CheckoutResponse(checkout_url="https://checkout.stripe.com/pay/789", session_id="cs_test_123")

    async def get_revenue_summary(self, org_id, db, project_id=None):
        from app.schemas.stripe_schema import RevenueSummaryResponse
        return RevenueSummaryResponse(total_revenue_cents=100000, total_fees_cents=10000, net_earnings_cents=90000, payment_count=50)

    async def get_revenue_breakdown(self, org_id, db, project_id=None):
        from app.schemas.stripe_schema import RevenueBreakdownResponse
        return RevenueBreakdownResponse(months=[], currency="usd")

    async def get_payments(self, org_id, db, project_id=None, limit=50, offset=0):
        from app.schemas.stripe_schema import PaymentListResponse
        return PaymentListResponse(payments=[], total_count=0)

    async def get_balance(self, org_id, db):
        from app.schemas.stripe_schema import BalanceResponse
        return BalanceResponse(available_cents=50000, pending_cents=10000)

    async def get_payout_history(self, org_id, db):
        from app.schemas.stripe_schema import PayoutListResponse
        return PayoutListResponse(payouts=[])

    async def handle_webhook_event(self, event, db):
        return f"Handled {event.get('type', 'unknown')}"


@pytest.fixture
def stripe_client(client):
    session = AsyncMock()
    
    call_count = [0]
    async def multi_execute(stmt):
        call_count[0] += 1
        mock = MagicMock()
        # First call is _resolve_org_id (returns UUID), subsequent may vary
        mock.scalar_one_or_none.return_value = "00000000-0000-0000-0000-000000000001"
        return mock
    
    session.execute = multi_execute
    session.commit = AsyncMock()

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_stripe_connect_service] = lambda: FakeStripeConnectService()
    yield client
    app.dependency_overrides.clear()


def test_connect_onboard(stripe_client):
    resp = stripe_client.post("/api/v1/stripe/connect/onboard")
    assert resp.status_code == 200
    data = resp.json()
    assert "account_link_url" in data


def test_connect_status(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/connect/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_complete"] is True
    assert data["charges_enabled"] is True


def test_refresh_account_link(stripe_client):
    resp = stripe_client.post("/api/v1/stripe/connect/account-link")
    assert resp.status_code == 200
    assert "account_link_url" in resp.json()


def test_revenue_summary(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/revenue")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_revenue_cents"] == 100000
    assert data["payment_count"] == 50


def test_revenue_breakdown(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/revenue/breakdown")
    assert resp.status_code == 200
    assert "months" in resp.json()


def test_payments_list(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/payments")
    assert resp.status_code == 200
    data = resp.json()
    assert "payments" in data
    assert "total_count" in data


def test_balance(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/balance")
    assert resp.status_code == 200
    data = resp.json()
    assert data["available_cents"] == 50000


def test_payout_history(stripe_client):
    resp = stripe_client.get("/api/v1/stripe/payouts")
    assert resp.status_code == 200
    assert "payouts" in resp.json()


def test_stripe_webhook_no_secret(stripe_client, monkeypatch):
    """When STRIPE_WEBHOOK_SECRET is not configured, webhook skips signature verification."""
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "")
    from app.core.config import get_settings
    get_settings.cache_clear()
    try:
        resp = stripe_client.post(
            "/api/v1/stripe/webhook",
            content=json.dumps({"type": "checkout.session.completed", "data": {"object": {}}}).encode(),
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
    finally:
        get_settings.cache_clear()
