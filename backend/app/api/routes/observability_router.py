"""Observability endpoints — dashboards, reports, and Sentry issues."""

from typing import Annotated

from fastapi import APIRouter, Depends

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
) -> SentryIssueListResponse:
    """Fetch unresolved Sentry issues for the SWEAAS project.

    AI agents use this data to autonomously discover and fix bugs.
    """
    return await obs_service.list_sentry_issues()
