"""Schemas for project endpoints."""

from pydantic import BaseModel, Field


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    github_username: str = Field(default="", max_length=100)
    monthly_budget_usd: float = Field(gt=0, default=1000.0)
    timeline_weeks: int = Field(gt=0, le=52, default=4)
    departments: list[str] = Field(default=["engineering"])


class ProjectResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    github_repo_url: str | None
    sentry_project_slug: str | None = None
    sentry_dsn: str | None = None
    public_token: str | None = None
    status: str
    created_at: str


class ProjectConfigPatchRequest(BaseModel):
    monthly_budget_usd: float | None = Field(default=None, gt=0)
    timeline_weeks: int | None = Field(default=None, gt=0, le=52)
    departments: list[str] | None = None
    max_agents: int | None = Field(default=None, gt=0, le=100)
    github_username: str | None = Field(default=None, max_length=100)


class ProjectConfigResponse(BaseModel):
    monthly_budget_usd: float
    timeline_weeks: int
    departments: list[str]
    max_agents: int


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
