"""Domain logic for budget and token tracking."""

from app.schemas.budget_schema import (
    AgentBudgetSnapshot,
    BudgetEstimateRequest,
    BudgetEstimateResponse,
    BudgetSummaryResponse,
)
from app.services.seed_data import AGENTS


class BudgetService:
    """Encapsulates token consumption and budget estimation logic."""

    def get_summary(self) -> BudgetSummaryResponse:
        agent_snapshots = [self._build_snapshot(agent) for agent in AGENTS]
        total_budget = sum(snapshot.token_budget for snapshot in agent_snapshots)
        total_used = sum(snapshot.tokens_used for snapshot in agent_snapshots)
        consumption_percent = round((total_used / total_budget) * 100, 2) if total_budget else 0.0

        return BudgetSummaryResponse(
            total_monthly_budget_usd=24_000.0,
            total_tokens_consumed=total_used,
            total_token_budget=total_budget,
            consumption_percent=consumption_percent,
            agents=agent_snapshots,
        )

    def estimate_budget(self, request: BudgetEstimateRequest) -> BudgetEstimateResponse:
        profile_multiplier = {
            "light": 18_000,
            "balanced": 36_000,
            "heavy": 60_000,
        }[request.usage_profile]
        estimated_monthly_tokens = request.seat_count * profile_multiplier * 30
        estimated_cost_usd = round(estimated_monthly_tokens / 1_000_000 * 12.5, 2)
        projected_daily_budget = max(int((request.monthly_budget_usd * 80) / request.seat_count), 1_000)

        notes = [
            "Keep 15-20% of the monthly budget in reserve for spikes in agent activity.",
            "Trigger warnings when any agent exceeds 85% of its daily token allocation.",
        ]
        if estimated_cost_usd > request.monthly_budget_usd:
            notes.append("Estimated spend exceeds the submitted budget. Reduce scope or usage intensity.")

        return BudgetEstimateResponse(
            recommended_plan=f"{request.usage_profile.title()} automation rollout",
            estimated_monthly_tokens=estimated_monthly_tokens,
            estimated_cost_usd=estimated_cost_usd,
            projected_daily_budget_per_agent=projected_daily_budget,
            notes=notes,
        )

    def get_agent_consumption(self, agent_id: str) -> AgentBudgetSnapshot | None:
        agent = next((record for record in AGENTS if record["agent_id"] == agent_id), None)
        if agent is None:
            return None
        return self._build_snapshot(agent)

    def _build_snapshot(self, agent: dict) -> AgentBudgetSnapshot:
        usage_percent = round((agent["tokens_used_today"] / agent["daily_token_budget"]) * 100, 2)
        status = "healthy"
        if usage_percent >= 100:
            status = "exhausted"
        elif usage_percent >= 85:
            status = "warning"

        return AgentBudgetSnapshot(
            agent_id=agent["agent_id"],
            name=agent["name"],
            token_budget=agent["daily_token_budget"],
            tokens_used=agent["tokens_used_today"],
            usage_percent=usage_percent,
            strike_count=agent["strike_count"],
            status=status,
        )
