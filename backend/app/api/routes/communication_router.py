"""Communication endpoints — email, calendar, CTO calls, and explainer videos."""

from __future__ import annotations

import logging
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
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
    TavusConfigCheckResponse,
    TavusReconciliationActionRequest,
    TavusReconciliationActionResponse,
    TavusReconciliationItem,
    TavusReconciliationResponse,
    TavusReplica,
    TavusReplicaListResponse,
    TavusWarmCheckAttempt,
    TavusWarmCheckResponse,
)
from app.models.agent import AgentConfig
from app.services.communication_service import CommunicationService
from app.services.replica_catalog_service import ReplicaCatalogService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/communication", tags=["communication"])
_REPLICA_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
replica_catalog_service = ReplicaCatalogService()


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


@router.get("/cto-context")
async def get_cto_context(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Return a live snapshot of agent activity for the CTO call side panel."""
    result = await db.execute(select(AgentConfig))
    agents = result.scalars().all()

    warning_agents = [a for a in agents if a.status == "warning"]
    total_budget = sum(a.daily_token_budget for a in agents)
    total_used = sum(a.tokens_used_today for a in agents)

    return {
        "agents": [
            {
                "agent_id": str(a.id),
                "name": a.name,
                "role": a.role,
                "department": a.department,
                "status": a.status,
                "current_focus": a.current_focus or "",
                "tokens_used_today": a.tokens_used_today,
                "daily_token_budget": a.daily_token_budget,
                "token_pct": round(a.tokens_used_today / a.daily_token_budget * 100) if a.daily_token_budget else 0,
                "strike_count": a.strike_count,
            }
            for a in agents
        ],
        "warnings": [
            {
                "agent_id": str(a.id),
                "name": a.name,
                "department": a.department,
                "token_pct": round(a.tokens_used_today / a.daily_token_budget * 100) if a.daily_token_budget else 0,
            }
            for a in warning_agents
        ],
        "active_tasks": [],
        "total_token_pct": round(total_used / total_budget * 100) if total_budget else 0,
    }


@router.get("/replicas", response_model=TavusReplicaListResponse)
async def list_replicas(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TavusReplicaListResponse:
    """Return stored Tavus replicas from the local catalog for user-facing flows.

    On a fresh install the ``replica_profiles`` table is empty — the CTO face
    picker in onboarding would then block users forever. If the local catalog
    is empty we lazy-seed it from the live Tavus API on the first request.
    If Tavus itself is unavailable we degrade to an empty list rather than
    hard-failing the whole onboarding screen.
    """
    replicas = await replica_catalog_service.list_stored_replicas(db)
    if not replicas:
        try:
            seeded = await replica_catalog_service.sync_live_to_db(db)
            if seeded:
                replicas = await replica_catalog_service.list_stored_replicas(db)
        except HTTPException:
            logger.warning(
                "Tavus replica seed failed — returning empty catalogue so the UI can show a fallback.",
                exc_info=True,
            )
        except Exception:
            logger.warning(
                "Unexpected error seeding replica catalogue — returning empty list.",
                exc_info=True,
            )
    return TavusReplicaListResponse(
        replicas=[
            TavusReplica(
                replica_id=replica.replica_id,
                replica_name=replica.replica_name,
                thumbnail_video_url=replica.thumbnail_video_url,
                model_name=replica.model_name,
                poster_image_url=replica_catalog_service.build_asset_url(request, replica),
            )
            for replica in replicas
        ]
    )


@router.post("/admin/replicas/warm-check", response_model=TavusWarmCheckResponse)
async def warm_check_replicas(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> TavusWarmCheckResponse:
    """Admin-only warm check against Tavus using retry/backoff before reconciliation."""
    replica_catalog_service.ensure_admin(user)
    result = await replica_catalog_service.warm_check()
    return TavusWarmCheckResponse(
        ok=result["ok"],
        attempts=[TavusWarmCheckAttempt(**attempt) for attempt in result["attempts"]],
    )


@router.get("/admin/tavus-config-check", response_model=TavusConfigCheckResponse)
async def tavus_config_check(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> TavusConfigCheckResponse:
    """Admin-only check for the configured internal Tavus replica/persona pair."""
    replica_catalog_service.ensure_admin(user)
    return await comm_service.inspect_tavus_internal_call_config()


@router.get("/admin/replicas/reconciliation", response_model=TavusReconciliationResponse)
async def reconcile_replicas(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TavusReconciliationResponse:
    """Admin-only diff between live Tavus replicas and the stored catalog."""
    replica_catalog_service.ensure_admin(user)
    result = await replica_catalog_service.summarize_reconciliation(db)
    return TavusReconciliationResponse(
        name_mismatch=[TavusReconciliationItem(**item) for item in result["name_mismatch"]],
        missing_in_database=[
            TavusReconciliationItem(**item) for item in result["missing_in_database"]
        ],
        updates_to_stored_replica=[
            TavusReconciliationItem(**item) for item in result["updates_to_stored_replica"]
        ],
    )


@router.post("/admin/replicas/reconciliation/actions", response_model=TavusReconciliationActionResponse)
async def apply_replica_reconciliation_action(
    request: Request,
    payload: TavusReconciliationActionRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TavusReconciliationActionResponse:
    """Admin-only apply endpoint for Tavus reconciliation actions."""
    replica_catalog_service.ensure_admin(user)
    replica = await replica_catalog_service.apply_action(db, payload.action, payload.model_dump())
    if replica is None:
        return TavusReconciliationActionResponse(applied=payload.action != "dismiss", replica=None)
    return TavusReconciliationActionResponse(
        applied=True,
        replica=TavusReplica(
            replica_id=replica.replica_id,
            replica_name=replica.replica_name,
            thumbnail_video_url=replica.thumbnail_video_url,
            model_name=replica.model_name,
            poster_image_url=replica_catalog_service.build_asset_url(request, replica),
        ),
    )


@router.get("/replica-posters/{replica_id}")
async def get_replica_poster(
    replica_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    """Serve the preferred cached poster for a stored Tavus replica."""
    if not _REPLICA_ID_PATTERN.fullmatch(replica_id):
        raise HTTPException(status_code=404, detail="Replica poster not found")

    replica = await replica_catalog_service._get_by_replica_id(db, replica_id)
    if replica is None:
        raise HTTPException(status_code=404, detail="Replica poster not found")

    etag = replica_catalog_service.build_poster_etag(replica)
    cache_headers = {
        "Cache-Control": "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
        "ETag": etag,
        "Vary": "Accept",
    }
    if if_none_match == etag:
        return Response(status_code=304, headers=cache_headers)

    if replica.poster_image_bytes is not None and replica.poster_image_content_type:
        return Response(
            content=replica.poster_image_bytes,
            media_type=replica.poster_image_content_type,
            headers=cache_headers,
        )
    return Response(
        content=replica.poster_svg,
        media_type="image/svg+xml",
        headers=cache_headers,
    )


@router.get("/replica-posters/svg/{replica_id}")
async def get_replica_poster_svg(
    replica_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    """Serve the generated SVG fallback poster for a stored Tavus replica."""
    if not _REPLICA_ID_PATTERN.fullmatch(replica_id):
        raise HTTPException(status_code=404, detail="Replica poster not found")

    replica = await replica_catalog_service._get_by_replica_id(db, replica_id)
    if replica is None:
        raise HTTPException(status_code=404, detail="Replica poster not found")

    etag = replica_catalog_service.build_poster_etag(replica)
    cache_headers = {
        "Cache-Control": "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400",
        "ETag": etag,
        "Vary": "Accept",
    }
    if if_none_match == etag:
        return Response(status_code=304, headers=cache_headers)

    return Response(
        content=replica.poster_svg,
        media_type="image/svg+xml",
        headers=cache_headers,
    )


@router.post("/cto-call", response_model=CTOCallResponse)
async def create_cto_call(
    request: CTOCallRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CTOCallResponse:
    """Start a video call with the CTO agent via Tavus.

    Primary use case: new-project intake interview — no project_id required.
    The CTO agent interviews the caller to gather requirements, budget, and team setup.

    Secondary use case: escalation for an existing project when agents hit budget limits.
    Pass project_id to inject live project context and agent activity into the conversation.
    """
    agent_result = await db.execute(select(AgentConfig))
    all_agents = agent_result.scalars().all()
    active_tasks = [
        f"- {a.name} ({a.department}): {a.current_focus or 'idle'}"
        for a in all_agents
        if a.status in ("active", "warning")
    ]
    warnings = [
        f"- {a.name}: {round(a.tokens_used_today / a.daily_token_budget * 100) if a.daily_token_budget else 0}% tokens used"
        for a in all_agents
        if a.status == "warning"
    ]

    project_data: dict[str, Any] | None = None
    if request.project_id:
        project_data = await _fetch_project_data(db, request.project_id)
        if project_data is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if active_tasks:
            project_data["agent_activity"] = "\n".join(active_tasks)
        if warnings:
            project_data["budget_warnings"] = "\n".join(warnings)
    else:
        # Interview mode — no existing project, just inject fleet context
        project_data = {
            "name": "New project (intake interview)",
            "status": "pending",
            "description": (
                "The user is being interviewed to define their new project. "
                "Ask about what they want to build, their team size, budget, "
                "timeline, and which departments (engineering, marketing, product) they need."
            ),
        }
        if active_tasks:
            project_data["agent_activity"] = "\n".join(active_tasks)

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
