"""Schemas for onboarding endpoints."""

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class DepartmentOption(BaseModel):
    key: Literal["engineering", "marketing", "product"]
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
