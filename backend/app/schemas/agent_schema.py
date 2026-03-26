"""Schemas for agent endpoints."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class AgentSummary(BaseModel):
    agent_id: str
    name: str
    department: Literal["engineering", "marketing", "product"]
    status: Literal["active", "warning", "paused"]
    owner_email: EmailStr
    daily_token_budget: int
    tokens_used_today: int


class AgentActivity(BaseModel):
    agent_id: str
    activity_id: str
    title: str
    detail: str
    state: Literal["queued", "running", "completed", "blocked"]
    started_at: str


class AgentDetail(AgentSummary):
    description: str
    current_focus: str
    strike_count: int = Field(ge=0)
    recent_activity: list[AgentActivity]
