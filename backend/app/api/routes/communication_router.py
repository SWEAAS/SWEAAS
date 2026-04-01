"""Communication endpoints — email, calendar, CTO calls, and explainer videos."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_communication_service
from app.models.project import Project
from app.schemas.communication_schema import (
    CalendarInviteRequest,
    CalendarInviteResponse,
    CTOCallRequest,
    CTOCallResponse,
    CustomerCallRequest,
    CustomerCallResponse,
    EmailMessageRequest,
    EmailMessageResponse,
    ExplainerVideoRequest,
    ExplainerVideoResponse,
)
from app.services.communication_service import CommunicationService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/communication", tags=["communication"])


async def _fetch_project_data(
    db: AsyncSession, project_id: str
) -> dict[str, Any] | None:
    """Load a project and its config, returning a flat dict for context builders."""
    stmt = (
        select(Project)
        .options(selectinload(Project.config))
        .where(Project.id == project_id)
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if project is None:
        return None

    data: dict[str, Any] = {
        "name": project.name,
        "description": project.description or "",
        "status": project.status,
        "github_repo_url": project.github_repo_url,
        "sentry_project_slug": project.sentry_project_slug,
    }
    if project.config:
        data["monthly_budget_usd"] = project.config.monthly_budget_usd
        data["timeline_weeks"] = project.config.timeline_weeks
        data["departments"] = project.config.departments
    return data


async def _fetch_project_by_token(
    db: AsyncSession, token: str
) -> dict[str, Any] | None:
    """Look up a project by its public_token (for unauthenticated end-user calls)."""
    stmt = (
        select(Project)
        .options(selectinload(Project.config))
        .where(Project.public_token == token)
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if project is None:
        return None

    return {
        "name": project.name,
        "description": project.description or "",
        "status": project.status,
    }


@router.post("/email", response_model=EmailMessageResponse)
async def send_email(
    request: EmailMessageRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> EmailMessageResponse:
    """Send an email via AgentMail."""
    return await comm_service.send_email(request)


@router.post("/calendar/invite", response_model=CalendarInviteResponse)
async def schedule_invite(
    request: CalendarInviteRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> CalendarInviteResponse:
    """Schedule a calendar invite for a meeting."""
    return await comm_service.schedule_invite(request)


@router.post("/customer-call", response_model=CustomerCallResponse)
async def create_customer_call(
    request: CustomerCallRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CustomerCallResponse:
    """Start a Tavus video session for **end users / customers** (support), not internal CTO.

    Uses customer replica/persona when `TAVUS_CUSTOMER_*` env vars are set. Chat-style
    support for product users uses `POST /agents/sup-cs-01/chat` with the Customer Support agent.
    """
    project_data = None
    if request.project_id:
        project_data = await _fetch_project_data(db, request.project_id)
    return await comm_service.create_customer_support_call(request, project_data=project_data)


@router.post("/cto-call", response_model=CTOCallResponse)
async def create_cto_call(
    request: CTOCallRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CTOCallResponse:
    """Start a video call with the CTO agent via Tavus.

    Returns a conversation URL that can be embedded in the frontend
    for a face-to-face discussion with the AI CTO.
    """
    project_data = await _fetch_project_data(db, request.project_id)
    if project_data is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await comm_service.create_cto_call(request, project_data=project_data)


@router.post("/customer-call/public", response_model=CustomerCallResponse)
async def create_public_customer_call(
    request: CustomerCallRequest,
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    x_project_token: Annotated[str | None, Header()] = None,
) -> CustomerCallResponse:
    """Public endpoint for end users of a client's product.

    Authenticates via ``X-Project-Token`` header instead of a SWEAAS JWT.
    The token is a per-project secret the client embeds in their product.
    """
    if not x_project_token:
        raise HTTPException(status_code=401, detail="Missing X-Project-Token header")

    project_data = await _fetch_project_by_token(db, x_project_token)
    if project_data is None:
        raise HTTPException(status_code=403, detail="Invalid project token")

    return await comm_service.create_customer_support_call(request, project_data=project_data)


@router.post("/explainer-video", response_model=ExplainerVideoResponse)
async def create_explainer_video(
    request: ExplainerVideoRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> ExplainerVideoResponse:
    """Generate an AI explainer video via Golpo.

    Creates a whiteboard-style video summarizing sprint progress,
    architecture decisions, or other technical topics.
    """
    return await comm_service.create_explainer_video(request)
