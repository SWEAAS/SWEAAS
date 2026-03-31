"""Budget estimation logic — determines optimal agent allocation within budget."""


def estimate_monthly_cost(agent_count: int, budget_usd: float) -> float:
    """Estimate monthly cost for a given agent count.

    Pricing model (simplified):
      - Each agent uses ~100K tokens/day on average
      - At $12.50 per 1M tokens (blended rate across providers)
      - Monthly cost = agent_count * 100_000 * 30 / 1_000_000 * 12.50
    """
    tokens_per_agent_per_month = 100_000 * 30
    cost_per_million = 12.50
    estimated = agent_count * tokens_per_agent_per_month / 1_000_000 * cost_per_million
    return round(min(estimated, budget_usd), 2)


def recommend_agent_count(budget_usd: float, usage_profile: str = "balanced") -> int:
    """Given a budget, recommend the maximum number of agents that fit."""
    multiplier = {"light": 0.6, "balanced": 1.0, "heavy": 1.8}[usage_profile]
    cost_per_agent = 100_000 * 30 / 1_000_000 * 12.50 * multiplier
    if cost_per_agent <= 0:
        return 1
    return max(1, int(budget_usd / cost_per_agent))
