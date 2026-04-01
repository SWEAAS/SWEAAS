"""Observability endpoints — dashboards, reports, and Sentry issues."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_observability_service
from app.schemas.observability_schema import (
    ObservabilityOverviewResponse,
    ObservabilityReportListResponse,
    SentryIssueListResponse,
)
from app.services.observability_service import ObservabilityService

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/overview", response_model=ObservabilityOverviewResponse)
def get_overview(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
) -> ObservabilityOverviewResponse:
    """High-level operational dashboard data."""
    return obs_service.get_overview()


@router.get("/reports", response_model=ObservabilityReportListResponse)
def list_reports(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
) -> ObservabilityReportListResponse:
    """List generated observability reports."""
    return obs_service.list_reports()


@router.get("/sentry/issues", response_model=SentryIssueListResponse)
async def list_sentry_issues(
    obs_service: Annotated[ObservabilityService, Depends(get_observability_service)],
    project_slug: Annotated[
        str | None,
        Query(description="Sentry project slug; omit to query the SWEAAS platform project"),
    ] = None,
) -> SentryIssueListResponse:
    """Fetch unresolved Sentry issues.

    Pass ``project_slug`` to query a specific customer project. Omit it
    to query the global SWEAAS platform project.
    """
    return await obs_service.list_sentry_issues(project_slug=project_slug)
