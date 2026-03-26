"""Onboarding endpoints."""

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
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
) -> list[DepartmentOption]:
    return onboarding_service.list_departments()


@router.post("/assess", response_model=OnboardingAssessmentResponse)
def assess_onboarding(
    request: OnboardingAssessmentRequest,
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
) -> OnboardingAssessmentResponse:
    return onboarding_service.assess(request)


@router.post("/contact", response_model=OnboardingContactResponse)
def create_onboarding_contact(
    request: OnboardingContactRequest,
    onboarding_service: OnboardingService = Depends(get_onboarding_service),
) -> OnboardingContactResponse:
    return onboarding_service.capture_contact(request)
