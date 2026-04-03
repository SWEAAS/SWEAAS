"""Schemas for agent endpoints."""

from typing import Literal

from pydantic import BaseModel, Field


class AgentSummary(BaseModel):
    agent_id: str
    name: str
    role: str
    department: str
    hierarchy_level: str
    status: str
    daily_token_budget: int
    tokens_used_today: int
    current_focus: str = ""
    parent_agent_id: str | None = None
    replica_id: str | None = None
    poster_image_url: str | None = None
    thumbnail_video_url: str | None = None


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
    email: str | None = None
    pronouns: str | None = None
    location: str | None = None
    timezone: str | None = None
    start_date: str | None = None
    recent_activity: list[AgentActivity]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=40)


class AgentChatResponse(BaseModel):
    agent_id: str
    response: str
    context_injected: bool = False
