"""Schemas for budget and token tracking endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class BudgetEstimateRequest(BaseModel):
    seat_count: int = Field(gt=0, le=100_000)
    monthly_budget_usd: float = Field(gt=0)
    usage_profile: Literal["light", "balanced", "heavy"] = "balanced"


class BudgetEstimateResponse(BaseModel):
    recommended_plan: str
    estimated_monthly_tokens: int
    estimated_cost_usd: float
    projected_daily_budget_per_agent: int
    notes: list[str]


class AgentBudgetSnapshot(BaseModel):
    agent_id: str
    name: str
    token_budget: int
    tokens_used: int
    usage_percent: float
    strike_count: int
    status: Literal["healthy", "warning", "exhausted"]


class BudgetSummaryResponse(BaseModel):
    total_monthly_budget_usd: float
    total_tokens_consumed: int
    total_token_budget: int
    consumption_percent: float
    agents: list[AgentBudgetSnapshot]
