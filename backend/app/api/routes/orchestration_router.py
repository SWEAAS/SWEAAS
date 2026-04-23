"""Orchestration endpoints — trigger agent execution, check status, view reports."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.core.dependencies import get_orchestration_service
from app.schemas.orchestration_schema import (
    OrchestrationExecuteRequest,
    OrchestrationExecuteResponse,
    OrchestrationStatusResponse,
    ReportDetailResponse,
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


@router.get("/reports/{project_id}/{report_id}", response_model=ReportDetailResponse)
async def get_report_detail(project_id: UUID, report_id: str) -> ReportDetailResponse:
    """Return the full body of a single report — task, session summary, CTO direction report."""
    from app.services.report_service import ReportService
    report_svc = ReportService()
    detail = await report_svc.get_report_detail(str(project_id), report_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return ReportDetailResponse(**detail)


@router.get("/reports/{project_id}/{report_id}/markdown")
async def download_report_markdown(project_id: UUID, report_id: str) -> Response:
    """Stream the report as ``text/markdown`` for immediate download."""
    from app.services.report_service import ReportService
    report_svc = ReportService()
    detail = await report_svc.get_report_detail(str(project_id), report_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Report not found")
    md = await report_svc.render_report_markdown(detail)
    filename = _slugify_filename(detail.get("title", "sweaas-report")) + ".md"
    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/{project_id}/{report_id}/pdf")
async def download_report_pdf(project_id: UUID, report_id: str):
    """Download a report as PDF.

    Prefers a presigned S3 URL when one was uploaded; falls back to rendering
    the PDF inline from the stored session data so downloads always work even
    when S3 isn't configured.
    """
    pid = str(project_id)
    from app.services.report_service import ReportService
    report_svc = ReportService()
    url = await report_svc.get_report_download_url(pid, report_id)
    if url:
        # Preserve the legacy contract for clients that expect a presigned URL
        # they can redirect the user to.
        return {"download_url": url, "report_id": report_id}

    # No S3 URL — stream a freshly rendered PDF from the stored content.
    detail = await report_svc.get_report_detail(pid, report_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Report not found")
    pdf_bytes = await report_svc.render_report_pdf_bytes(detail)
    filename = _slugify_filename(detail.get("title", "sweaas-report")) + ".pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _slugify_filename(text: str) -> str:
    import re
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", text.strip())
    return slug.strip("-") or "report"
