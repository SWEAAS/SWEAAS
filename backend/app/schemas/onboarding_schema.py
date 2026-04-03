"""Schemas for onboarding endpoints."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

MAX_UNIQUE_NON_SANTA_PERSONAS = 75
MAX_PERSONA_NAME_VARIANTS = 1 + 26 + (26 * 26)
MAX_TEAM_ASSIGNMENTS = MAX_UNIQUE_NON_SANTA_PERSONAS * MAX_PERSONA_NAME_VARIANTS
MAX_ORG_SIZE = MAX_TEAM_ASSIGNMENTS + 1


class DepartmentOption(BaseModel):
    key: Literal["engineering", "marketing", "product", "support"]
    label: str
    suggested_agents: int = Field(ge=0)


class OnboardingAssessmentRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    team_size: int = Field(gt=0, le=100_000)
    monthly_budget_usd: float = Field(gt=0)
    contact_email: EmailStr
    github_username: str = Field(default="", max_length=100)
    needs_onboarding_call: bool = False


class OnboardingAssessmentResponse(BaseModel):
    company_name: str
    recommended_departments: list[DepartmentOption]
    suggested_rollout: list[str]
    estimated_agent_count: int
    estimated_monthly_cost_usd: float
    notes: list[str]


class OnboardingContactRequest(BaseModel):
    contact_email: EmailStr
    calendar_email: EmailStr
    preferred_timeframe: str = Field(min_length=2, max_length=120)
    notes: str = Field(default="", max_length=500)


class OnboardingContactResponse(BaseModel):
    status: Literal["received", "scheduled"]
    next_step: str


class DepartmentSizes(BaseModel):
    engineering: int = Field(default=22, ge=0, le=MAX_TEAM_ASSIGNMENTS)
    marketing: int = Field(default=9, ge=0, le=MAX_TEAM_ASSIGNMENTS)
    product: int = Field(default=9, ge=0, le=MAX_TEAM_ASSIGNMENTS)
    support: int = Field(default=9, ge=0, le=MAX_TEAM_ASSIGNMENTS)


class TeamPersonaAssignment(BaseModel):
    agent_id: str = Field(min_length=1, max_length=64)
    archetype_agent_id: str | None = Field(default=None, max_length=64)
    replica_id: str = Field(min_length=1, max_length=64)
    replica_name: str = Field(min_length=1, max_length=160)
    model_name: str = Field(default="", max_length=100)
    poster_image_url: str | None = None
    thumbnail_video_url: str = Field(default="", max_length=500)
    department: Literal["engineering", "marketing", "product", "support"] = "engineering"
    role: str = Field(default="specialist", max_length=120)
    hierarchy_level: Literal["cto", "manager", "specialist"] = "specialist"
    parent_agent_id: str | None = Field(default=None, max_length=64)


class TeamOnboardingConfigRequest(BaseModel):
    company_size: int = Field(gt=0, le=MAX_ORG_SIZE)
    overall_budget_usd: float = Field(gt=0)
    department_sizes: DepartmentSizes = Field(default_factory=DepartmentSizes)
    cto_assignment: TeamPersonaAssignment | None = None
    assignments: list[TeamPersonaAssignment] = Field(default_factory=list, max_length=MAX_TEAM_ASSIGNMENTS)
    completed: bool = True


class TeamOnboardingConfigResponse(BaseModel):
    completed: bool = False
    company_size: int = 0
    overall_budget_usd: float = 0
    department_sizes: DepartmentSizes = Field(default_factory=DepartmentSizes)
    cto_assignment: TeamPersonaAssignment | None = None
    assignments: list[TeamPersonaAssignment] = Field(default_factory=list)
    updated_at: str | None = None


class CTOAssignmentPatchRequest(BaseModel):
    cto_assignment: TeamPersonaAssignment | None = None
