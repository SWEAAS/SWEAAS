"""Onboarding endpoints — assessment, department selection, contact capture, and team setup."""

import logging
from datetime import date
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_onboarding_service
from app.core.user_provisioning import ensure_org_id
from app.models.agent import AgentConfig
from app.models.notification import NotificationPreference
from app.models.project import Project, ProjectConfig
from app.models.user import Organization, User
from app.schemas.onboarding_schema import (
    CTOAssignmentPatchRequest,
    DepartmentOption,
    OnboardingAssessmentRequest,
    OnboardingAssessmentResponse,
    OnboardingContactRequest,
    OnboardingContactResponse,
    TeamOnboardingConfigRequest,
    TeamOnboardingConfigResponse,
    TeamPersonaAssignment,
)
from app.services.onboarding_service import OnboardingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["onboarding"])


async def _resolve_org_id(user: AuthenticatedUser, db: AsyncSession) -> str:
    """Return the caller's org UUID as a string, auto-provisioning on first hit."""
    return str(await ensure_org_id(db, user))


@router.get("/departments", response_model=list[DepartmentOption])
def list_departments(
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> list[DepartmentOption]:
    """List available departments with suggested agent counts."""
    return onboarding_service.list_departments()


@router.post("/assess", response_model=OnboardingAssessmentResponse)
async def assess(
    request: OnboardingAssessmentRequest,
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardingAssessmentResponse:
    """Assess a new organization and recommend configuration.

    Persists phone number and creates default notification preferences
    when a matching user is found.
    """
    result = onboarding_service.assess(request)

    stmt = select(User).where(User.email == request.contact_email)
    db_result = await db.execute(stmt)
    user = db_result.scalar_one_or_none()

    if user and request.phone_number:
        user.phone_number = request.phone_number

    if user:
        pref_stmt = select(NotificationPreference).where(
            NotificationPreference.user_id == user.id,
            NotificationPreference.project_id.is_(None),
        )
        existing = (await db.execute(pref_stmt)).scalar_one_or_none()
        if existing is None:
            pref = NotificationPreference(
                id=uuid4(),
                user_id=user.id,
                email_enabled=request.enable_email_notifications,
                sms_enabled=request.enable_sms_notifications,
                budget_threshold_percent=request.budget_alert_threshold_percent,
            )
            db.add(pref)
            logger.info("Created default notification preferences for user %s", user.id)

    return result


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


_ROLE_DESCRIPTIONS: dict[str, str] = {
    "cto": "Top-level orchestrator. Decomposes user requests into department tasks.",
    "engineering_manager": "Orchestrates engineering specialists. Reviews code and coordinates releases.",
    "frontend_dev": "Builds React components, implements UI designs, manages frontend state.",
    "backend_architect": "Designs and implements API endpoints, database schemas, and service logic.",
    "devops": "Manages CI/CD pipelines, infrastructure, and deployment workflows.",
    "qa_tester": "Writes and runs tests, validates code quality, catches regressions.",
    "marketing_manager": "Orchestrates marketing campaigns and growth initiatives.",
    "growth_analyst": "Tracks growth metrics, optimizes funnels, recommends budget allocation.",
    "product_manager": "Manages product roadmap, prioritizes features, coordinates with stakeholders.",
    "product_ops": "Synthesizes roadmap signals and keeps product rituals coordinated.",
    "support_manager": "Orchestrates customer-facing agents: triages feedback, escalates to product/engineering.",
    "customer_support": "Primary AI agent for product-user chat: answers how-to questions, collects issues.",
}

_TOKEN_BUDGETS: dict[str, int] = {
    "cto": 200_000,
    "manager": 100_000,
    "specialist": 75_000,
}


async def _ensure_default_project(org_id: UUID, budget_usd: float, db: AsyncSession) -> Project:
    """Return the first project for the org, creating one if none exists.

    Loads ``ProjectConfig`` explicitly rather than via lazy relationship access
    so we stay within AsyncSession semantics (no implicit IO on attribute read).
    """
    result = await db.execute(
        select(Project).where(Project.organization_id == org_id).limit(1)
    )
    project = result.scalar_one_or_none()
    if project is not None:
        cfg_stmt = select(ProjectConfig).where(ProjectConfig.project_id == project.id)
        config = (await db.execute(cfg_stmt)).scalar_one_or_none()
        if config is None:
            config = ProjectConfig(project_id=project.id, monthly_budget_usd=budget_usd)
            db.add(config)
        else:
            config.monthly_budget_usd = budget_usd
        return project

    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
    project = Project(
        organization_id=org_id,
        name=f"{org.name}'s project",
        slug=f"{org.slug}-default",
        description="Default project created during onboarding",
    )
    db.add(project)
    await db.flush()

    config = ProjectConfig(
        project_id=project.id,
        monthly_budget_usd=budget_usd,
    )
    db.add(config)
    return project


async def _persist_agents(
    project_id: UUID,
    cto_assignment: TeamPersonaAssignment | None,
    assignments: list[TeamPersonaAssignment],
    db: AsyncSession,
) -> None:
    """Delete existing agents for the project and recreate from onboarding config."""
    existing = await db.execute(
        select(AgentConfig).where(AgentConfig.project_id == project_id)
    )
    for agent in existing.scalars().all():
        await db.delete(agent)
    await db.flush()

    agent_id_map: dict[str, UUID] = {}
    all_assignments: list[TeamPersonaAssignment] = []
    if cto_assignment:
        all_assignments.append(cto_assignment)
    all_assignments.extend(assignments)

    for assignment in all_assignments:
        db_id = uuid4()
        agent_id_map[assignment.agent_id] = db_id

        parent_db_id = (
            agent_id_map.get(assignment.parent_agent_id)
            if assignment.parent_agent_id
            else None
        )

        description = _ROLE_DESCRIPTIONS.get(assignment.role, "")
        token_budget = _TOKEN_BUDGETS.get(assignment.hierarchy_level, 75_000)

        agent = AgentConfig(
            id=db_id,
            project_id=project_id,
            name=assignment.replica_name,
            role=assignment.role,
            department=assignment.department,
            hierarchy_level=assignment.hierarchy_level,
            parent_agent_id=parent_db_id,
            daily_token_budget=token_budget,
            description=description,
            current_focus="Standing by for new delegation.",
            email=f"{assignment.role.replace('_', '.')}@sweaas.dev",
            replica_id=assignment.replica_id,
            poster_image_url=assignment.poster_image_url,
            thumbnail_video_url=assignment.thumbnail_video_url or None,
            start_date=date.today(),
        )
        db.add(agent)


@router.put("/team-config", response_model=TeamOnboardingConfigResponse)
async def save_team_config(
    request: TeamOnboardingConfigRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    onboarding_service: Annotated[OnboardingService, Depends(get_onboarding_service)],
) -> TeamOnboardingConfigResponse:
    """Persist the workspace team onboarding selections and create agent rows."""
    org_id = await _resolve_org_id(user, db)
    try:
        result = onboarding_service.save_team_config(org_id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    org_uuid = UUID(org_id)
    if request.project_id:
        # Target a specific project — used by the "New project" flow so each
        # project keeps its own team roster. Verify ownership before touching
        # agent rows so a malicious payload can't overwrite another org's team.
        try:
            project_uuid = UUID(request.project_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid project_id.") from exc
        project_stmt = select(Project).where(
            Project.id == project_uuid,
            Project.organization_id == org_uuid,
        )
        project = (await db.execute(project_stmt)).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found in this organization.")
        # Keep the per-project budget in sync with what the user picked.
        cfg_stmt = select(ProjectConfig).where(ProjectConfig.project_id == project.id)
        cfg = (await db.execute(cfg_stmt)).scalar_one_or_none()
        if cfg is None:
            db.add(ProjectConfig(project_id=project.id, monthly_budget_usd=request.overall_budget_usd))
        else:
            cfg.monthly_budget_usd = request.overall_budget_usd
    else:
        project = await _ensure_default_project(org_uuid, request.overall_budget_usd, db)
    await _persist_agents(project.id, request.cto_assignment, request.assignments, db)

    stmt = select(User).where(User.supabase_uid == user.uid)
    db_user = (await db.execute(stmt)).scalar_one_or_none()
    if db_user and not db_user.onboarding_completed:
        db_user.onboarding_completed = True

    await db.commit()
    return result


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
