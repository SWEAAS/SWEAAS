"""Schemas for user feedback and external feedback tool webhooks."""

from typing import Literal

from pydantic import BaseModel, Field


class FeedbackSubmitRequest(BaseModel):
    """Product-user or owner-submitted feedback routed to engineering agents."""

    project_id: str = Field(default="", max_length=64)
    source: Literal[
        "user_feedback", "in_app", "email", "api",
        "sentry", "intercom", "zendesk", "canny",
        "slack", "github_issue", "other",
    ] = "in_app"
    category: Literal["bug", "feature", "improvement", "ux", "billing", "general"] = "general"
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=10_000)
    user_email: str | None = Field(default=None, max_length=320)
    priority: Literal["low", "medium", "high", "critical"] = "medium"


class FeedbackItemResponse(BaseModel):
    feedback_id: str
    project_id: str
    status: Literal["received", "triaged", "routed_to_agents"]
    title: str
    created_at: str


class FeedbackListResponse(BaseModel):
    items: list[FeedbackItemResponse]


class FeedbackWebhookPayload(BaseModel):
    """Generic payload for ingesting feedback from tools like Intercom or Canny."""

    external_id: str = ""
    title: str = ""
    body: str = ""
    project_id: str = ""
