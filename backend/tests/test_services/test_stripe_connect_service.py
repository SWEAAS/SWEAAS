"""Unit tests for StripeConnectService."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.stripe_connect_service import StripeConnectService

ORG_ID = uuid4()
PROJECT_ID = str(uuid4())
STRIPE_ACCOUNT_ID = "acct_test_123"
CONNECTED_ACCOUNT_DB_ID = uuid4()


def _mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


def _make_acct_row(**overrides):
    defaults = dict(
        id=CONNECTED_ACCOUNT_DB_ID,
        organization_id=ORG_ID,
        stripe_account_id=STRIPE_ACCOUNT_ID,
        onboarding_complete=False,
        charges_enabled=False,
        payouts_enabled=False,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ── create_connected_account ─────────────────────────────────────


class TestCreateConnectedAccount:
    @patch("app.services.stripe_connect_service._configure_stripe")
    @patch("app.services.stripe_connect_service.stripe")
    def test_creates_new_account(self, mock_stripe, mock_config):
        svc = StripeConnectService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        mock_stripe.Account.create.return_value = SimpleNamespace(id="acct_new_123")
        mock_stripe.AccountLink.create.return_value = SimpleNamespace(
            url="https://connect.stripe.com/onboard/acct_new_123"
        )

        result = asyncio.run(svc.create_connected_account(ORG_ID, "user@example.com", db))

        assert "https://connect.stripe.com/onboard" in result.account_link_url
        mock_stripe.Account.create.assert_called_once()
        db.add.assert_called_once()
        db.flush.assert_awaited_once()

    @patch("app.services.stripe_connect_service._configure_stripe")
    @patch("app.services.stripe_connect_service.stripe")
    def test_returns_link_for_existing_account(self, mock_stripe, mock_config):
        svc = StripeConnectService()
        db = _mock_db()

        existing_acct = _make_acct_row()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_acct
        db.execute = AsyncMock(return_value=mock_result)

        mock_stripe.AccountLink.create.return_value = SimpleNamespace(
            url="https://connect.stripe.com/onboard/existing"
        )

        result = asyncio.run(svc.create_connected_account(ORG_ID, "user@example.com", db))

        assert "existing" in result.account_link_url
        mock_stripe.Account.create.assert_not_called()


# ── get_onboarding_status ────────────────────────────────────────


class TestGetOnboardingStatus:
    def test_no_account_returns_defaults(self):
        svc = StripeConnectService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = asyncio.run(svc.get_onboarding_status(ORG_ID, db))

        assert result.stripe_account_id is None
        assert result.onboarding_complete is False

    def test_returns_account_status(self):
        svc = StripeConnectService()
        db = _mock_db()

        acct = _make_acct_row(onboarding_complete=True, charges_enabled=True, payouts_enabled=True)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = acct
        db.execute = AsyncMock(return_value=mock_result)

        result = asyncio.run(svc.get_onboarding_status(ORG_ID, db))

        assert result.stripe_account_id == STRIPE_ACCOUNT_ID
        assert result.onboarding_complete is True
        assert result.charges_enabled is True


# ── create_checkout_session ──────────────────────────────────────


class TestCreateCheckoutSession:
    @patch("app.services.stripe_connect_service._configure_stripe")
    @patch("app.services.stripe_connect_service.stripe")
    def test_creates_session_with_destination_charge(self, mock_stripe, mock_config):
        svc = StripeConnectService()
        db = _mock_db()

        mock_stripe.Price.retrieve.return_value = SimpleNamespace(unit_amount=5000)
        mock_stripe.checkout.Session.create.return_value = SimpleNamespace(
            url="https://checkout.stripe.com/session/cs_123",
            id="cs_123",
        )

        with patch("app.services.stripe_connect_service.settings") as mock_settings:
            mock_settings.stripe_platform_fee_percent = 10.0
            mock_settings.stripe_connect_return_url = "http://localhost:5173/revenue?stripe=complete"

            result = asyncio.run(
                svc.create_checkout_session(
                    project_id=PROJECT_ID,
                    price_id="price_abc",
                    connected_account_id=CONNECTED_ACCOUNT_DB_ID,
                    stripe_account_id=STRIPE_ACCOUNT_ID,
                    db=db,
                )
            )

        assert result.session_id == "cs_123"
        assert "checkout.stripe.com" in result.checkout_url

        call_kwargs = mock_stripe.checkout.Session.create.call_args
        pi_data = call_kwargs[1]["payment_intent_data"]
        assert pi_data["application_fee_amount"] == 500  # 10% of 5000
        assert pi_data["transfer_data"]["destination"] == STRIPE_ACCOUNT_ID


# ── get_revenue_summary ──────────────────────────────────────────


class TestGetRevenueSummary:
    def test_no_connected_account_returns_empty(self):
        svc = StripeConnectService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = asyncio.run(svc.get_revenue_summary(ORG_ID, db))

        assert result.total_revenue_cents == 0
        assert result.payment_count == 0

    def test_aggregates_revenue(self):
        svc = StripeConnectService()
        db = _mock_db()

        acct_result = MagicMock()
        acct_result.scalar_one_or_none.return_value = CONNECTED_ACCOUNT_DB_ID

        revenue_row = SimpleNamespace(
            total_revenue=100000,
            total_fees=10000,
            net_earnings=90000,
            payment_count=5,
        )
        revenue_result = MagicMock()
        revenue_result.one.return_value = revenue_row

        db.execute = AsyncMock(side_effect=[acct_result, revenue_result])

        result = asyncio.run(svc.get_revenue_summary(ORG_ID, db))

        assert result.total_revenue_cents == 100000
        assert result.total_fees_cents == 10000
        assert result.net_earnings_cents == 90000
        assert result.payment_count == 5

    def test_filters_by_project(self):
        svc = StripeConnectService()
        db = _mock_db()

        acct_result = MagicMock()
        acct_result.scalar_one_or_none.return_value = CONNECTED_ACCOUNT_DB_ID

        revenue_row = SimpleNamespace(
            total_revenue=50000,
            total_fees=5000,
            net_earnings=45000,
            payment_count=2,
        )
        revenue_result = MagicMock()
        revenue_result.one.return_value = revenue_row

        db.execute = AsyncMock(side_effect=[acct_result, revenue_result])

        result = asyncio.run(svc.get_revenue_summary(ORG_ID, db, project_id=PROJECT_ID))

        assert result.payment_count == 2


# ── handle_webhook_event ─────────────────────────────────────────


class TestHandleWebhookEvent:
    def test_routes_account_updated(self):
        svc = StripeConnectService()
        svc.handle_account_updated = AsyncMock()
        db = _mock_db()

        event = {"type": "account.updated", "id": "evt_1", "data": {"object": {}}}
        result = asyncio.run(svc.handle_webhook_event(event, db))

        assert result == "ok:account.updated"
        svc.handle_account_updated.assert_awaited_once()

    def test_routes_checkout_completed(self):
        svc = StripeConnectService()
        svc.handle_checkout_completed = AsyncMock()
        db = _mock_db()

        event = {"type": "checkout.session.completed", "id": "evt_2", "data": {"object": {}}}
        result = asyncio.run(svc.handle_webhook_event(event, db))

        assert result == "ok:checkout.session.completed"
        svc.handle_checkout_completed.assert_awaited_once()

    def test_routes_payment_intent_succeeded(self):
        svc = StripeConnectService()
        svc.handle_payment_intent_succeeded = AsyncMock()
        db = _mock_db()

        event = {"type": "payment_intent.succeeded", "id": "evt_3", "data": {"object": {}}}
        result = asyncio.run(svc.handle_webhook_event(event, db))

        assert result == "ok:payment_intent.succeeded"
        svc.handle_payment_intent_succeeded.assert_awaited_once()

    def test_routes_payout_events(self):
        svc = StripeConnectService()
        svc.handle_payout_event = AsyncMock()
        db = _mock_db()

        for etype in ("payout.paid", "payout.failed", "payout.canceled"):
            svc.handle_payout_event.reset_mock()
            event = {"type": etype, "id": "evt_x", "data": {"object": {}}}
            result = asyncio.run(svc.handle_webhook_event(event, db))

            assert result == f"ok:{etype}"
            svc.handle_payout_event.assert_awaited_once()

    def test_invoice_events_logged_no_action(self):
        svc = StripeConnectService()
        db = _mock_db()

        event = {"type": "invoice.paid", "id": "evt_4", "data": {"object": {}}}
        result = asyncio.run(svc.handle_webhook_event(event, db))

        assert result == "ok:invoice.paid"

    def test_unknown_event_returns_ok(self):
        svc = StripeConnectService()
        db = _mock_db()

        event = {"type": "unknown.event", "id": "evt_5", "data": {"object": {}}}
        result = asyncio.run(svc.handle_webhook_event(event, db))

        assert result == "ok:unknown.event"


# ── handle_account_updated ───────────────────────────────────────


class TestHandleAccountUpdated:
    def test_updates_existing_account(self):
        svc = StripeConnectService()
        db = _mock_db()

        acct_row = _make_acct_row()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = acct_row
        db.execute = AsyncMock(return_value=mock_result)

        event = {
            "data": {
                "object": {
                    "id": STRIPE_ACCOUNT_ID,
                    "charges_enabled": True,
                    "payouts_enabled": True,
                    "details_submitted": True,
                }
            }
        }

        asyncio.run(svc.handle_account_updated(event, db))

        assert acct_row.charges_enabled is True
        assert acct_row.payouts_enabled is True
        assert acct_row.onboarding_complete is True
        db.flush.assert_awaited_once()

    def test_missing_account_id_is_noop(self):
        svc = StripeConnectService()
        db = _mock_db()

        event = {"data": {"object": {}}}
        asyncio.run(svc.handle_account_updated(event, db))

        db.execute.assert_not_awaited()

    def test_unknown_account_logs_warning(self):
        svc = StripeConnectService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        event = {"data": {"object": {"id": "acct_unknown"}}}
        asyncio.run(svc.handle_account_updated(event, db))

        db.flush.assert_not_awaited()


# ── handle_payment_intent_succeeded ──────────────────────────────


class TestHandlePaymentIntentSucceeded:
    def test_updates_existing_record(self):
        svc = StripeConnectService()
        db = _mock_db()

        record = SimpleNamespace(status="pending")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = record
        db.execute = AsyncMock(return_value=mock_result)

        event = {"data": {"object": {"id": "pi_123"}}}
        asyncio.run(svc.handle_payment_intent_succeeded(event, db))

        assert record.status == "succeeded"
        db.flush.assert_awaited_once()

    def test_no_record_is_noop(self):
        svc = StripeConnectService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        event = {"data": {"object": {"id": "pi_456"}}}
        asyncio.run(svc.handle_payment_intent_succeeded(event, db))

        db.flush.assert_not_awaited()

    def test_missing_id_is_noop(self):
        svc = StripeConnectService()
        db = _mock_db()

        event = {"data": {"object": {}}}
        asyncio.run(svc.handle_payment_intent_succeeded(event, db))

        db.execute.assert_not_awaited()
