"""Schemas for agent endpoints."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class AgentSummary(BaseModel):
    agent_id: str
    name: str
    role: str
    department: Literal["engineering", "marketing", "product", "support"]
    hierarchy_level: str
    status: Literal["active", "warning", "paused", "strike"]
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
    parent_agent_id: str | None = None
    recent_activity: list[AgentActivity]


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class AgentChatResponse(BaseModel):
    agent_id: str
    response: str
    context_injected: bool = False
