"""Schemas for observability and reporting endpoints."""

from typing import Literal

from pydantic import BaseModel


class DepartmentMetric(BaseModel):
    department: str
    active_agents: int
    tokens_used_today: int
    warnings: int


class ObservabilityOverviewResponse(BaseModel):
    report_generated_at: str
    total_active_agents: int
    total_running_tasks: int
    departments: list[DepartmentMetric]


class ObservabilityReport(BaseModel):
    report_id: str
    title: str
    summary: str
    report_type: str
    created_at: str


class ObservabilityReportListResponse(BaseModel):
    reports: list[ObservabilityReport]


class SentryIssue(BaseModel):
    issue_id: str
    title: str
    level: str
    count: int
    first_seen: str
    last_seen: str


class SentryIssueListResponse(BaseModel):
    issues: list[SentryIssue]
