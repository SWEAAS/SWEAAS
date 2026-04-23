"""Report generation — session summaries and CTO direction reports as PDF.

Uses reportlab for PDF generation. Reports are stored in S3 and metadata
in the PostgreSQL reports table.
"""

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ReportService:
    """Generates dated PDF reports for session and CTO direction summaries."""

    async def generate_session_report(
        self,
        project_id: str,
        org_id: str,
        session_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate a PDF session report from orchestration results.

        Returns metadata including the S3 key and report_id.
        """
        report_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        title = f"Session Report — {now.strftime('%Y-%m-%d %H:%M UTC')}"

        pdf_bytes = self._build_session_pdf(title, session_data, now)

        from app.services.s3_service import S3Service
        s3 = S3Service()
        upload_result = await s3.upload_report(
            org_id=org_id,
            project_id=project_id,
            pdf_bytes=pdf_bytes,
            report_type="session",
        )

        await self._persist_report_metadata(
            report_id=report_id,
            project_id=project_id,
            title=title,
            summary=session_data.get("session_summary", "")[:2000],
            report_type="session",
            s3_key=upload_result.get("key", ""),
        )

        return {
            "report_id": report_id,
            "title": title,
            "report_type": "session",
            "s3_key": upload_result.get("key", ""),
            "created_at": now.isoformat(),
        }

    async def generate_direction_report(
        self,
        project_id: str,
        org_id: str,
        session_data: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate a CTO direction report as PDF."""
        report_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        title = f"CTO Direction Report — {now.strftime('%Y-%m-%d %H:%M UTC')}"

        pdf_bytes = self._build_direction_pdf(title, session_data, now)

        from app.services.s3_service import S3Service
        s3 = S3Service()
        upload_result = await s3.upload_report(
            org_id=org_id,
            project_id=project_id,
            pdf_bytes=pdf_bytes,
            report_type="direction",
        )

        await self._persist_report_metadata(
            report_id=report_id,
            project_id=project_id,
            title=title,
            summary=session_data.get("direction_report", "")[:2000],
            report_type="direction",
            s3_key=upload_result.get("key", ""),
        )

        return {
            "report_id": report_id,
            "title": title,
            "report_type": "direction",
            "s3_key": upload_result.get("key", ""),
            "created_at": now.isoformat(),
        }

    def _decode_summary(self, raw: str | None) -> dict[str, Any]:
        """Parse the stored ``Report.summary`` JSON blob, tolerant of legacy shapes.

        Orchestration sessions store ``{session_id, task, session_summary, direction_report}``.
        The older PDF pipeline stored ``{text, s3_key}``. We accept both shapes
        so detail/markdown/PDF endpoints work regardless of which path created
        the row.
        """
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return {"session_summary": raw}
        return data if isinstance(data, dict) else {"session_summary": str(data)}

    async def list_reports(self, project_id: str) -> list[dict]:
        """List all reports for a project from the DB.

        Includes a short ``session_summary_preview`` so the UI can render a
        real description next to each row. Clicking into a row fetches the
        full body via :meth:`get_report_detail`.
        """
        try:
            from sqlalchemy import select
            from app.core.database import async_session_factory
            from app.models.task import Report

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Report)
                    .where(Report.project_id == uuid.UUID(project_id))
                    .order_by(Report.created_at.desc())
                    .limit(50)
                )
                reports = result.scalars().all()
                out: list[dict] = []
                for r in reports:
                    meta = self._decode_summary(r.summary)
                    preview = (
                        meta.get("session_summary")
                        or meta.get("direction_report")
                        or meta.get("text")
                        or ""
                    )
                    out.append({
                        "report_id": str(r.id),
                        "title": r.title,
                        "report_type": r.report_type,
                        "created_at": r.created_at.isoformat() if r.created_at else "",
                        "session_summary_preview": str(preview)[:500],
                        "has_download": True,
                    })
                return out
        except Exception as exc:
            logger.warning("Could not list reports: %s", exc)
            return []

    async def get_report_detail(self, project_id: str, report_id: str) -> dict | None:
        """Return the full body of a single report, including all stored sections."""
        try:
            from sqlalchemy import select
            from app.core.database import async_session_factory
            from app.models.task import Report

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Report).where(
                        Report.id == uuid.UUID(report_id),
                        Report.project_id == uuid.UUID(project_id),
                    )
                )
                report = result.scalar_one_or_none()
                if report is None:
                    return None
                meta = self._decode_summary(report.summary)
                return {
                    "report_id": str(report.id),
                    "title": report.title,
                    "report_type": report.report_type,
                    "created_at": report.created_at.isoformat() if report.created_at else "",
                    "task": meta.get("task", ""),
                    "session_id": meta.get("session_id", ""),
                    "session_summary": str(meta.get("session_summary") or meta.get("text") or ""),
                    "direction_report": str(meta.get("direction_report") or ""),
                    "s3_key": meta.get("s3_key", ""),
                }
        except Exception as exc:
            logger.warning("Could not fetch report detail: %s", exc)
            return None

    async def render_report_markdown(self, detail: dict) -> str:
        """Assemble a Markdown document from a report detail dict."""
        title = detail.get("title") or "SWEAAS Report"
        created = detail.get("created_at", "")
        task = detail.get("task", "")
        session_id = detail.get("session_id", "")
        session_summary = detail.get("session_summary") or ""
        direction_report = detail.get("direction_report") or ""

        def _pretty(body: str) -> str:
            # Agents often emit JSON in a single line. Pretty-print for readability
            # while leaving non-JSON strings untouched.
            body = body.strip()
            if body.startswith("{") or body.startswith("["):
                try:
                    parsed = json.loads(body)
                    return "```json\n" + json.dumps(parsed, indent=2) + "\n```"
                except (TypeError, ValueError):
                    return body
            return body

        parts = [f"# {title}", ""]
        if created:
            parts.append(f"_Generated at {created}_")
        if session_id:
            parts.append(f"_Session `{session_id}`_")
        if task:
            parts.extend(["", "## Task", "", task])
        if session_summary:
            parts.extend(["", "## Session summary", "", _pretty(session_summary)])
        if direction_report:
            parts.extend(["", "## CTO direction report", "", _pretty(direction_report)])
        parts.append("")
        return "\n".join(parts)

    async def render_report_pdf_bytes(self, detail: dict) -> bytes:
        """Build a PDF from a stored report on demand.

        Works even when S3 isn't configured so every persisted report has a
        reliable download path.
        """
        # Re-use the existing session-PDF builder with the detail we already have.
        now = datetime.now(timezone.utc)
        session_data = {
            "session_id": detail.get("session_id", ""),
            "task": detail.get("task", ""),
            "status": "completed",
            "project_id": "",
            "session_summary": detail.get("session_summary", ""),
            "direction_report": detail.get("direction_report", ""),
        }
        title = detail.get("title") or f"SWEAAS Report — {now.strftime('%Y-%m-%d %H:%M UTC')}"
        if detail.get("report_type") == "direction":
            return self._build_direction_pdf(title, session_data, now)
        return self._build_session_pdf(title, session_data, now)

    async def get_report_download_url(self, project_id: str, report_id: str) -> str:
        """Get a presigned S3 URL for a PDF, if one was uploaded for this report."""
        try:
            from sqlalchemy import select
            from app.core.database import async_session_factory
            from app.models.task import Report

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Report).where(Report.id == uuid.UUID(report_id))
                )
                report = result.scalar_one_or_none()
                if report and report.summary:
                    meta = self._decode_summary(report.summary)
                    s3_key = meta.get("s3_key", "")
                    if s3_key:
                        from app.services.s3_service import S3Service
                        s3 = S3Service()
                        return await s3.get_report_url(s3_key)
        except Exception as exc:
            logger.warning("Could not get report URL: %s", exc)
        return ""

    # ── PDF generation ──

    def _build_session_pdf(
        self,
        title: str,
        session_data: dict,
        timestamp: datetime,
    ) -> bytes:
        """Build a session report PDF using reportlab."""
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        except ImportError:
            logger.warning("reportlab not installed — returning placeholder PDF")
            return self._placeholder_pdf(title, session_data)

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter)
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=18)
        body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)

        elements = [
            Paragraph(title, title_style),
            Spacer(1, 12),
            Paragraph(f"<b>Date:</b> {timestamp.strftime('%Y-%m-%d %H:%M UTC')}", body_style),
            Paragraph(f"<b>Session ID:</b> {session_data.get('session_id', 'N/A')}", body_style),
            Paragraph(f"<b>Project:</b> {session_data.get('project_id', 'N/A')}", body_style),
            Paragraph(f"<b>Status:</b> {session_data.get('status', 'N/A')}", body_style),
            Spacer(1, 20),
            Paragraph("<b>Task</b>", styles["Heading2"]),
            Paragraph(session_data.get("task", "N/A")[:2000], body_style),
            Spacer(1, 12),
            Paragraph("<b>Session Summary</b>", styles["Heading2"]),
            Paragraph(
                str(session_data.get("session_summary", "No summary available."))[:4000],
                body_style,
            ),
            Spacer(1, 12),
        ]

        results = session_data.get("results", [])
        if results:
            elements.append(Paragraph("<b>Specialist Results</b>", styles["Heading2"]))
            for r in results[:10]:
                agent = r.get("agent", "unknown")
                output = str(r.get("output", ""))[:500]
                elements.append(Paragraph(f"<b>{agent}:</b> {output}", body_style))
                elements.append(Spacer(1, 6))

        doc.build(elements)
        return buf.getvalue()

    def _build_direction_pdf(
        self,
        title: str,
        session_data: dict,
        timestamp: datetime,
    ) -> bytes:
        """Build a CTO direction report PDF."""
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        except ImportError:
            logger.warning("reportlab not installed — returning placeholder PDF")
            return self._placeholder_pdf(title, session_data)

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter)
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("Title", parent=styles["Title"], fontSize=18)
        body_style = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14)

        elements = [
            Paragraph(title, title_style),
            Spacer(1, 12),
            Paragraph(f"<b>Date:</b> {timestamp.strftime('%Y-%m-%d %H:%M UTC')}", body_style),
            Paragraph(f"<b>Project:</b> {session_data.get('project_id', 'N/A')}", body_style),
            Spacer(1, 20),
            Paragraph("<b>Direction Report</b>", styles["Heading2"]),
            Paragraph(
                str(session_data.get("direction_report", "No direction report available."))[:4000],
                body_style,
            ),
            Spacer(1, 12),
            Paragraph("<b>Session Summary</b>", styles["Heading2"]),
            Paragraph(
                str(session_data.get("session_summary", "N/A"))[:2000],
                body_style,
            ),
        ]

        doc.build(elements)
        return buf.getvalue()

    @staticmethod
    def _placeholder_pdf(title: str, data: dict) -> bytes:
        """Minimal PDF when reportlab is not available."""
        content = f"%PDF-1.4\n% {title}\n% {json.dumps(data)[:500]}\n%%EOF"
        return content.encode("utf-8")

    async def _persist_report_metadata(
        self,
        report_id: str,
        project_id: str,
        title: str,
        summary: str,
        report_type: str,
        s3_key: str,
    ) -> None:
        """Save report metadata to the reports table."""
        try:
            from app.core.database import async_session_factory
            from app.models.task import Report

            async with async_session_factory() as session:
                report = Report(
                    id=uuid.UUID(report_id),
                    project_id=uuid.UUID(project_id),
                    title=title,
                    summary=json.dumps({"text": summary, "s3_key": s3_key}),
                    report_type=report_type,
                )
                session.add(report)
                await session.commit()
        except Exception as exc:
            logger.warning("Failed to persist report metadata: %s", exc)
