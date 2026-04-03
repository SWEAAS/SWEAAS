"""Schemas for orchestration endpoints."""

from uuid import UUID

from pydantic import BaseModel, Field


class OrchestrationExecuteRequest(BaseModel):
    project_id: UUID = Field(..., description="Project UUID to execute against")
    task: str = Field(..., description="Task description for the CTO to decompose")
    feedback_items: list[dict] | None = Field(
        default=None, description="Optional pre-loaded feedback items"
    )


class OrchestrationExecuteResponse(BaseModel):
    session_id: str
    project_id: str
    status: str
    session_summary: str = ""
    direction_report: str = ""
    error: str | None = None


class OrchestrationStatusResponse(BaseModel):
    project_id: str
    active_agents: int
    running_tasks: int
    status: str
    active_sessions: list[str] = []


class SessionSummary(BaseModel):
    session_id: str
    status: str
    task: str
    started_at: str | None = None
    completed_at: str | None = None


class SessionListResponse(BaseModel):
    project_id: str
    sessions: list[SessionSummary]


class ReportItem(BaseModel):
    report_id: str
    title: str
    report_type: str
    created_at: str
    download_url: str | None = None


class ReportListResponse(BaseModel):
    project_id: str
    reports: list[ReportItem]
