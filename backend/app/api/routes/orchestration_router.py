"""Orchestration endpoints — trigger agent execution, check status, view reports."""

from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.dependencies import get_orchestration_service
from app.schemas.orchestration_schema import (
    OrchestrationExecuteRequest,
    OrchestrationExecuteResponse,
    OrchestrationStatusResponse,
    ReportListResponse,
    SessionListResponse,
    SessionSummary,
)
from app.services.orchestration_service import OrchestrationService

router = APIRouter(prefix="/orchestration", tags=["Orchestration"])


@router.post("/execute", response_model=OrchestrationExecuteResponse)
async def execute_task(
    request: OrchestrationExecuteRequest,
    svc: OrchestrationService = Depends(get_orchestration_service),
):
    """Submit a task for hierarchical agent execution.

    The CTO decomposes the task, delegates to department managers,
    who further delegate to specialists. Results flow back up through
    an aggregator and CTO review phase.
    """
    project_id_str = str(request.project_id)
    result = await svc.submit_task(
        project_id=project_id_str,
        task_description=request.task,
        feedback_items=request.feedback_items,
    )
    return OrchestrationExecuteResponse(
        session_id=result.get("session_id", ""),
        project_id=result.get("project_id", project_id_str),
        status=result.get("status", "unknown"),
        session_summary=result.get("session_summary", ""),
        direction_report=result.get("direction_report", ""),
        error=result.get("error"),
    )


@router.get("/status/{project_id}", response_model=OrchestrationStatusResponse)
async def get_status(
    project_id: UUID,
    svc: OrchestrationService = Depends(get_orchestration_service),
):
    """Check the current execution status for a project."""
    return await svc.get_execution_status(str(project_id))


@router.get("/sessions/{project_id}", response_model=SessionListResponse)
async def list_sessions(
    project_id: UUID,
    svc: OrchestrationService = Depends(get_orchestration_service),
):
    """List all past execution sessions for a project."""
    pid = str(project_id)
    sessions = await svc.list_sessions(pid)
    return SessionListResponse(
        project_id=pid,
        sessions=[SessionSummary(**s) for s in sessions],
    )


@router.get("/reports/{project_id}", response_model=ReportListResponse)
async def list_reports(project_id: UUID):
    """List all generated reports (session + CTO direction) for a project."""
    pid = str(project_id)
    try:
        from app.services.report_service import ReportService
        report_svc = ReportService()
        reports = await report_svc.list_reports(pid)
        return ReportListResponse(project_id=pid, reports=reports)
    except Exception:
        return ReportListResponse(project_id=pid, reports=[])


@router.get("/reports/{project_id}/{report_id}/pdf")
async def download_report_pdf(project_id: UUID, report_id: str):
    """Get a presigned download URL for a PDF report."""
    pid = str(project_id)
    try:
        from app.services.report_service import ReportService
        report_svc = ReportService()
        url = await report_svc.get_report_download_url(pid, report_id)
        return {"download_url": url, "report_id": report_id}
    except Exception as exc:
        return {"error": str(exc), "report_id": report_id}
