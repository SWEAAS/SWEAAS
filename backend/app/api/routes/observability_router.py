"""Observability endpoints — dashboards, reports, and Sentry issues."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_observability_service
from app.schemas.observability_schema import (
    ObservabilityOverviewResponse,
    ObservabilityReportListResponse,
    SentryIssueListResponse,
)
from app.services.observability_service import ObservabilityService

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/overview", response_model=ObservabilityOverviewResponse)
async def get_overview(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: UUID | None = Query(default=None),
) -> ObservabilityOverviewResponse:
    """High-level operational dashboard data."""
    return await obs_service.get_overview(db, project_id=project_id)


@router.get("/reports", response_model=ObservabilityReportListResponse)
async def list_reports(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: UUID | None = Query(default=None),
) -> ObservabilityReportListResponse:
    """List generated observability reports."""
    return await obs_service.list_reports(db, project_id=project_id)


@router.get("/sentry/issues", response_model=SentryIssueListResponse)
async def list_sentry_issues(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
    project_slug: Annotated[
        str | None,
        Query(description="Sentry project slug; omit to query the SWEAAS platform project"),
    ] = None,
) -> SentryIssueListResponse:
    """Fetch unresolved Sentry issues."""
    return await obs_service.list_sentry_issues(project_slug=project_slug)
