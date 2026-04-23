"""Unit tests for BudgetService."""

import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from uuid import uuid4

import pytest

from app.schemas.budget_schema import BudgetEstimateRequest
from app.services.budget_service import BudgetService, _alerted_agents


@pytest.fixture(autouse=True)
def _clear_alerted_agents():
    _alerted_agents.clear()
    yield
    _alerted_agents.clear()


class TestGetSummary:
    def test_returns_all_agents(self):
        svc = BudgetService()
        summary = svc.get_summary()
        assert summary.total_monthly_budget_usd == 24_000.0
        assert len(summary.agents) > 0
        assert summary.total_token_budget > 0
        assert summary.total_tokens_consumed >= 0

    def test_consumption_percent_calculated(self):
        svc = BudgetService()
        summary = svc.get_summary()
        expected = round(
            (summary.total_tokens_consumed / summary.total_token_budget) * 100, 2
        )
        assert summary.consumption_percent == expected

    @patch("app.services.budget_service.budget_tracker")
    def test_uses_live_data_when_initialised(self, mock_tracker):
        mock_tracker.is_initialised = True
        mock_tracker.get_snapshot.return_value = {
            "tokens_used_today": 999,
            "daily_token_budget": 10_000,
            "strike_count": 0,
        }
        svc = BudgetService()
        summary = svc.get_summary()
        for agent in summary.agents:
            assert agent.tokens_used == 999
            assert agent.token_budget == 10_000

    @patch("app.services.budget_service.budget_tracker")
    def test_falls_back_to_seed_when_not_initialised(self, mock_tracker):
        mock_tracker.is_initialised = False
        svc = BudgetService()
        summary = svc.get_summary()
        assert summary.agents[0].agent_id == "cto-01"
        assert summary.agents[0].tokens_used == 45_000


class TestEstimateBudget:
    def test_light_profile(self):
        svc = BudgetService()
        req = BudgetEstimateRequest(
            seat_count=5, monthly_budget_usd=10_000.0, usage_profile="light"
        )
        resp = svc.estimate_budget(req)
        assert resp.estimated_monthly_tokens == 5 * 18_000 * 30
        assert resp.recommended_plan == "Light automation rollout"

    def test_balanced_profile(self):
        svc = BudgetService()
        req = BudgetEstimateRequest(
            seat_count=3, monthly_budget_usd=8_000.0, usage_profile="balanced"
        )
        resp = svc.estimate_budget(req)
        assert resp.estimated_monthly_tokens == 3 * 36_000 * 30
        assert resp.recommended_plan == "Balanced automation rollout"

    def test_heavy_profile(self):
        svc = BudgetService()
        req = BudgetEstimateRequest(
            seat_count=2, monthly_budget_usd=5_000.0, usage_profile="heavy"
        )
        resp = svc.estimate_budget(req)
        assert resp.estimated_monthly_tokens == 2 * 60_000 * 30
        assert resp.recommended_plan == "Heavy automation rollout"

    def test_over_budget_note_added(self):
        svc = BudgetService()
        req = BudgetEstimateRequest(
            seat_count=100, monthly_budget_usd=1.0, usage_profile="heavy"
        )
        resp = svc.estimate_budget(req)
        assert any("exceeds" in n.lower() for n in resp.notes)

    def test_daily_budget_floor(self):
        svc = BudgetService()
        req = BudgetEstimateRequest(
            seat_count=100_000, monthly_budget_usd=1.0, usage_profile="light"
        )
        resp = svc.estimate_budget(req)
        assert resp.projected_daily_budget_per_agent >= 1_000


class TestGetAgentConsumption:
    def test_found(self):
        svc = BudgetService()
        snap = svc.get_agent_consumption("cto-01")
        assert snap is not None
        assert snap.agent_id == "cto-01"
        assert snap.name == "CTO Agent"

    def test_not_found(self):
        svc = BudgetService()
        assert svc.get_agent_consumption("nonexistent") is None


class TestCreateCheckoutSession:
    def test_raises_when_no_key(self):
        """When Stripe isn't configured we surface an error instead of returning a fake URL."""
        from fastapi import HTTPException
        with patch("app.services.budget_service.settings") as mock_settings:
            mock_settings.stripe_secret_key = ""
            svc = BudgetService()
            with pytest.raises(HTTPException) as excinfo:
                asyncio.run(svc.create_checkout_session("proj-1", "price_abc"))
            assert excinfo.value.status_code == 503

    @patch("stripe.checkout.Session.create")
    def test_creates_real_session(self, mock_stripe_create):
        mock_session = MagicMock()
        mock_session.url = "https://checkout.stripe.com/pay/cs_real"
        mock_session.id = "cs_real_123"
        mock_stripe_create.return_value = mock_session

        with patch("app.services.budget_service.settings") as mock_settings:
            mock_settings.stripe_secret_key = "sk_test_xxx"
            svc = BudgetService()
            resp = asyncio.run(svc.create_checkout_session("proj-1", "price_abc"))

        assert resp.checkout_url == "https://checkout.stripe.com/pay/cs_real"
        assert resp.session_id == "cs_real_123"
        mock_stripe_create.assert_called_once()
        call_kwargs = mock_stripe_create.call_args[1]
        assert call_kwargs["mode"] == "subscription"
        assert call_kwargs["metadata"]["project_id"] == "proj-1"


class TestHandleStripeWebhookEvent:
    def test_checkout_session_completed(self):
        svc = BudgetService()
        event = {
            "type": "checkout.session.completed",
            "id": "evt_123",
            "data": {
                "object": {
                    "id": "cs_abc",
                    "mode": "subscription",
                    "subscription": "sub_xyz",
                    "customer": "cus_456",
                    "metadata": {"project_id": "proj-1"},
                }
            },
        }
        result = svc.handle_stripe_webhook_event(event)
        assert result == "ok:checkout.session.completed"

    def test_unknown_event_type(self):
        svc = BudgetService()
        event = {"type": "invoice.paid", "id": "evt_789", "data": {"object": {}}}
        result = svc.handle_stripe_webhook_event(event)
        assert result == "ok:invoice.paid"

    def test_empty_event(self):
        svc = BudgetService()
        result = svc.handle_stripe_webhook_event({})
        assert result == "ok:"


class TestCheckBudgetThresholdsAndNotify:
    def test_notifies_when_above_threshold(self):
        mock_ns = MagicMock()
        mock_ns.notify_budget_threshold = AsyncMock()

        with patch("app.services.budget_service.budget_tracker") as mock_tracker:
            mock_tracker.is_initialised = True
            mock_tracker.get_snapshot.return_value = {
                "tokens_used_today": 90_000,
                "daily_token_budget": 100_000,
                "strike_count": 0,
            }
            with patch(
                "app.services.notification_service.NotificationService",
                return_value=mock_ns,
            ):
                svc = BudgetService()
                asyncio.run(
                    svc.check_budget_thresholds_and_notify(
                        user_id=uuid4(),
                        org_id=uuid4(),
                        project_id="proj-1",
                        db=MagicMock(),
                    )
                )

        assert mock_ns.notify_budget_threshold.await_count > 0

    def test_skips_when_below_threshold(self):
        mock_ns = MagicMock()
        mock_ns.notify_budget_threshold = AsyncMock()

        with patch("app.services.budget_service.budget_tracker") as mock_tracker:
            mock_tracker.is_initialised = True
            mock_tracker.get_snapshot.return_value = {
                "tokens_used_today": 1_000,
                "daily_token_budget": 100_000,
                "strike_count": 0,
            }
            with patch(
                "app.services.notification_service.NotificationService",
                return_value=mock_ns,
            ):
                svc = BudgetService()
                asyncio.run(
                    svc.check_budget_thresholds_and_notify(
                        user_id=uuid4(),
                        org_id=uuid4(),
                        project_id="proj-1",
                        db=MagicMock(),
                    )
                )

        mock_ns.notify_budget_threshold.assert_not_awaited()

    def test_does_not_duplicate_alerts(self):
        mock_ns = MagicMock()
        mock_ns.notify_budget_threshold = AsyncMock()

        with patch("app.services.budget_service.budget_tracker") as mock_tracker:
            mock_tracker.is_initialised = True
            mock_tracker.get_snapshot.return_value = {
                "tokens_used_today": 90_000,
                "daily_token_budget": 100_000,
                "strike_count": 0,
            }
            with patch(
                "app.services.notification_service.NotificationService",
                return_value=mock_ns,
            ):
                svc = BudgetService()
                asyncio.run(
                    svc.check_budget_thresholds_and_notify(
                        user_id=uuid4(), org_id=uuid4(), project_id="p", db=MagicMock(),
                    )
                )
                first_count = mock_ns.notify_budget_threshold.await_count

                asyncio.run(
                    svc.check_budget_thresholds_and_notify(
                        user_id=uuid4(), org_id=uuid4(), project_id="p", db=MagicMock(),
                    )
                )
                assert mock_ns.notify_budget_threshold.await_count == first_count
