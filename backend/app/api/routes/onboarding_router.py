"""Onboarding endpoints — assessment, department selection, and contact capture."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import get_onboarding_service
from app.schemas.onboarding_schema import (
    DepartmentOption,
    OnboardingAssessmentRequest,
    OnboardingAssessmentResponse,
    OnboardingContactRequest,
    OnboardingContactResponse,
)
from app.services.onboarding_service import OnboardingService

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/departments", response_model=list[DepartmentOption])
def list_departments(
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> list[DepartmentOption]:
    """List available departments with suggested agent counts."""
    return onboarding_service.list_departments()


@router.post("/assess", response_model=OnboardingAssessmentResponse)
def assess(
    request: OnboardingAssessmentRequest,
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingAssessmentResponse:
    """Assess a new organization and recommend configuration.

    Returns suggested departments, rollout plan, agent count,
    and estimated monthly cost based on the provided budget.
    """
    return onboarding_service.assess(request)


@router.post("/contact", response_model=OnboardingContactResponse)
def capture_contact(
    request: OnboardingContactRequest,
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> OnboardingContactResponse:
    """Capture contact details for onboarding follow-up."""
    return onboarding_service.capture_contact(request)
