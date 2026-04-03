"""Onboarding endpoints — assessment, department selection, contact capture, and team setup."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_onboarding_service
from app.models.user import User
from app.schemas.onboarding_schema import (
    CTOAssignmentPatchRequest,
    DepartmentOption,
    OnboardingAssessmentRequest,
    OnboardingAssessmentResponse,
    OnboardingContactRequest,
    OnboardingContactResponse,
    TeamOnboardingConfigRequest,
    TeamOnboardingConfigResponse,
)
from app.services.onboarding_service import OnboardingService

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


async def _resolve_org_id(user: AuthenticatedUser, db: AsyncSession) -> str:
    stmt = select(User.organization_id).where(User.supabase_uid == user.uid)
    result = await db.execute(stmt)
    org_id = result.scalar_one_or_none()
    if org_id is None:
        raise HTTPException(status_code=400, detail="User is not associated with an organization.")
    return str(org_id)


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


@router.get("/team-config", response_model=TeamOnboardingConfigResponse)
async def get_team_config(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> TeamOnboardingConfigResponse:
    """Return the saved workspace team onboarding configuration."""
    org_id = await _resolve_org_id(user, db)
    return onboarding_service.get_team_config(org_id)


@router.put("/team-config", response_model=TeamOnboardingConfigResponse)
async def save_team_config(
    request: TeamOnboardingConfigRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> TeamOnboardingConfigResponse:
    """Persist the workspace team onboarding selections."""
    org_id = await _resolve_org_id(user, db)
    try:
        return onboarding_service.save_team_config(org_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/team-config/cto", response_model=TeamOnboardingConfigResponse)
async def patch_cto_assignment(
    request: CTOAssignmentPatchRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> TeamOnboardingConfigResponse:
    """Persist the currently configured CTO face without requiring full onboarding."""
    org_id = await _resolve_org_id(user, db)
    try:
        return onboarding_service.patch_cto_assignment(org_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
