"""Observability endpoints."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_observability_service
from app.schemas.observability_schema import (
    ObservabilityOverviewResponse,
    ObservabilityReportListResponse,
)
from app.services.observability_service import ObservabilityService

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/overview", response_model=ObservabilityOverviewResponse)
def get_observability_overview(
    observability_service: ObservabilityService = Depends(get_observability_service),
) -> ObservabilityOverviewResponse:
    return observability_service.get_overview()


@router.get("/reports", response_model=ObservabilityReportListResponse)
def list_reports(
    observability_service: ObservabilityService = Depends(get_observability_service),
) -> ObservabilityReportListResponse:
    return observability_service.list_reports()
