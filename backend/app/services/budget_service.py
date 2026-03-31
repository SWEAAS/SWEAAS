"""Domain logic for budget tracking, token consumption, and Stripe billing."""

import logging

from app.core.config import get_settings
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

    Integrates with:
      - LiteLLM for per-agent token accounting
      - Stripe for subscription billing and checkout
    """

    def get_summary(self) -> BudgetSummaryResponse:
        agent_snapshots = [self._build_snapshot(agent) for agent in AGENTS]
        total_budget = sum(s.token_budget for s in agent_snapshots)
        total_used = sum(s.tokens_used for s in agent_snapshots)
        consumption_pct = round((total_used / total_budget) * 100, 2) if total_budget else 0.0

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
        daily_budget = max(int((request.monthly_budget_usd * 80) / request.seat_count), 1_000)

        notes = [
            "Keep 15-20% of the monthly budget in reserve for spikes.",
            "Warnings trigger when any agent exceeds 85% of its daily allocation.",
        ]
        if estimated_cost > request.monthly_budget_usd:
            notes.append("Estimated spend exceeds the submitted budget — reduce scope or intensity.")

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
        """Create a Stripe Checkout session for a project subscription.

        Requires STRIPE_SECRET_KEY to be configured.
        """
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
            success_url="https://app.sweaas.dev/billing/success?session_id={CHECKOUT_SESSION_ID}",
            cancel_url="https://app.sweaas.dev/billing/cancel",
            metadata={"project_id": project_id},
        )
        return StripeCheckoutResponse(checkout_url=session.url, session_id=session.id)

    def _build_snapshot(self, agent: dict) -> AgentBudgetSnapshot:
        usage_pct = round(
            (agent["tokens_used_today"] / agent["daily_token_budget"]) * 100, 2
        )
        if usage_pct >= 100:
            status = "exhausted"
        elif usage_pct >= 85:
            status = "warning"
        else:
            status = "healthy"

        strike_count = agent.get("strike_count", 0)
        if strike_count > 0 and status == "exhausted":
            status = "strike"

        return AgentBudgetSnapshot(
            agent_id=agent["agent_id"],
            name=agent["name"],
            token_budget=agent["daily_token_budget"],
            tokens_used=agent["tokens_used_today"],
            usage_percent=usage_pct,
            strike_count=strike_count,
            status=status,
        )
