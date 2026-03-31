"""Cost estimator unit tests."""

from app.services.cost_estimator import estimate_monthly_cost, recommend_agent_count


def test_estimate_monthly_cost():
    cost = estimate_monthly_cost(agent_count=5, budget_usd=10000.0)
    assert cost > 0
    assert cost <= 10000.0


def test_estimate_caps_at_budget():
    cost = estimate_monthly_cost(agent_count=100, budget_usd=500.0)
    assert cost == 500.0


def test_recommend_agent_count_balanced():
    count = recommend_agent_count(budget_usd=5000.0, usage_profile="balanced")
    assert count >= 1


def test_recommend_agent_count_light():
    light = recommend_agent_count(budget_usd=5000.0, usage_profile="light")
    balanced = recommend_agent_count(budget_usd=5000.0, usage_profile="balanced")
    assert light >= balanced


def test_recommend_agent_count_heavy():
    heavy = recommend_agent_count(budget_usd=5000.0, usage_profile="heavy")
    balanced = recommend_agent_count(budget_usd=5000.0, usage_profile="balanced")
    assert heavy <= balanced
