"""Domain logic for budget tracking, token consumption, and Stripe billing."""

import logging
from typing import Any

from app.core.config import get_settings
from app.core.llm_budget import budget_tracker
from app.schemas.budget_schema import (
    AgentBudgetSnapshot,
    BudgetEstimateRequest,
    BudgetEstimateResponse,
    BudgetSummaryResponse,
    StripeCheckoutResponse,
)
from app.services.seed_data import AGENTS

logger = logging.getLogger(__name__)
settings = get_settings()


class BudgetService:
    """Token consumption tracking and budget estimation.

    Reads live usage from ``BudgetTracker`` when initialised, falling back
    to seed data for agent metadata.
    """

    def get_summary(self) -> BudgetSummaryResponse:
        agent_snapshots = [self._build_snapshot(agent) for agent in AGENTS]
        total_budget = sum(s.token_budget for s in agent_snapshots)
        total_used = sum(s.tokens_used for s in agent_snapshots)
        consumption_pct = (
            round((total_used / total_budget) * 100, 2) if total_budget else 0.0
        )

        return BudgetSummaryResponse(
            total_monthly_budget_usd=24_000.0,
            total_tokens_consumed=total_used,
            total_token_budget=total_budget,
            consumption_percent=consumption_pct,
            agents=agent_snapshots,
        )

    def estimate_budget(self, request: BudgetEstimateRequest) -> BudgetEstimateResponse:
        profile_multiplier = {"light": 18_000, "balanced": 36_000, "heavy": 60_000}[
            request.usage_profile
        ]
        estimated_monthly_tokens = request.seat_count * profile_multiplier * 30
        estimated_cost = round(estimated_monthly_tokens / 1_000_000 * 12.5, 2)
        daily_budget = max(
            int((request.monthly_budget_usd * 80) / request.seat_count), 1_000,
        )

        notes = [
            "Keep 15-20% of the monthly budget in reserve for spikes.",
            "Warnings trigger when any agent exceeds 85% of its daily allocation.",
        ]
        if estimated_cost > request.monthly_budget_usd:
            notes.append(
                "Estimated spend exceeds the submitted budget — reduce scope or intensity."
            )

        return BudgetEstimateResponse(
            recommended_plan=f"{request.usage_profile.title()} automation rollout",
            estimated_monthly_tokens=estimated_monthly_tokens,
            estimated_cost_usd=estimated_cost,
            projected_daily_budget_per_agent=daily_budget,
            notes=notes,
        )

    def get_agent_consumption(self, agent_id: str) -> AgentBudgetSnapshot | None:
        agent = next((r for r in AGENTS if r["agent_id"] == agent_id), None)
        if agent is None:
            return None
        return self._build_snapshot(agent)

    async def create_checkout_session(
        self, project_id: str, price_id: str
    ) -> StripeCheckoutResponse:
        if not settings.stripe_secret_key:
            return StripeCheckoutResponse(
                checkout_url="https://checkout.stripe.com/dev-placeholder",
                session_id="cs_dev_placeholder",
            )

        import stripe

        stripe.api_key = settings.stripe_secret_key
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=(
                "https://app.sweaas.dev/billing/success?session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url="https://app.sweaas.dev/billing/cancel",
            metadata={"project_id": project_id},
        )
        return StripeCheckoutResponse(checkout_url=session.url, session_id=session.id)

    def _build_snapshot(self, agent: dict) -> AgentBudgetSnapshot:
        aid = agent["agent_id"]
        live = budget_tracker.get_snapshot(aid) if budget_tracker.is_initialised else None

        if live:
            tokens_used = live["tokens_used_today"]
            token_budget = live["daily_token_budget"]
            strike_count = live["strike_count"]
        else:
            tokens_used = agent["tokens_used_today"]
            token_budget = agent["daily_token_budget"]
            strike_count = agent.get("strike_count", 0)

        usage_pct = round((tokens_used / token_budget) * 100, 2) if token_budget else 0.0

        if usage_pct >= 100:
            status = "exhausted"
        elif usage_pct >= 85:
            status = "warning"
        else:
            status = "healthy"

        if strike_count > 0 and status == "exhausted":
            status = "strike"

        return AgentBudgetSnapshot(
            agent_id=aid,
            name=agent["name"],
            token_budget=token_budget,
            tokens_used=tokens_used,
            usage_percent=usage_pct,
            strike_count=strike_count,
            status=status,
        )

    def handle_stripe_webhook_event(self, event: dict[str, Any]) -> str:
        """Log and branch on Stripe webhook types; extend to persist subscription IDs."""
        etype = event.get("type", "")
        eid = event.get("id", "")
        obj = (event.get("data") or {}).get("object") or {}
        logger.info("Stripe webhook type=%s id=%s", etype, eid)
        if etype == "checkout.session.completed" and obj.get("mode") == "subscription":
            meta = obj.get("metadata") or {}
            logger.info(
                "Stripe checkout completed session=%s subscription=%s customer=%s project_id=%s",
                obj.get("id"),
                obj.get("subscription"),
                obj.get("customer"),
                meta.get("project_id"),
            )
        return f"ok:{etype}"
