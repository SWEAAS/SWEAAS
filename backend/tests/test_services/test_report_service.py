"""Unit tests for ReportService."""

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.report_service import ReportService

PROJECT_ID = str(uuid4())
ORG_ID = str(uuid4())


# ── list_reports ─────────────────────────────────────────────────


class TestListReports:
    def test_returns_report_list(self):
        svc = ReportService()

        report_rows = [
            SimpleNamespace(
                id=uuid4(),
                title="Session Report — 2025-01-15",
                report_type="session",
                created_at=datetime(2025, 1, 15, tzinfo=timezone.utc),
            ),
            SimpleNamespace(
                id=uuid4(),
                title="CTO Direction Report — 2025-01-14",
                report_type="direction",
                created_at=datetime(2025, 1, 14, tzinfo=timezone.utc),
            ),
        ]

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = report_rows

        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.list_reports(PROJECT_ID))

        assert len(result) == 2
        assert result[0]["title"] == "Session Report — 2025-01-15"
        assert result[0]["report_type"] == "session"
        assert result[0]["download_url"] is None
        assert result[1]["report_type"] == "direction"

    def test_returns_empty_on_exception(self):
        svc = ReportService()

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=Exception("DB down"))
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.list_reports(PROJECT_ID))

        assert result == []

    def test_returns_empty_for_no_reports(self):
        svc = ReportService()

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []

        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.list_reports(PROJECT_ID))

        assert result == []


# ── get_report_download_url ──────────────────────────────────────


class TestGetReportDownloadUrl:
    def test_returns_presigned_url(self):
        svc = ReportService()

        report_id = str(uuid4())
        s3_key = f"reports/{ORG_ID}/{PROJECT_ID}/session/report.pdf"

        report_row = SimpleNamespace(
            id=report_id,
            summary=json.dumps({"s3_key": s3_key, "text": "summary"}),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = report_row

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        mock_s3_svc = MagicMock()
        mock_s3_svc.get_report_url = AsyncMock(return_value="https://s3.amazonaws.com/presigned")

        with patch("app.core.database.async_session_factory", mock_factory), \
             patch.dict("sys.modules", {
                 "app.services.s3_service": MagicMock(S3Service=MagicMock(return_value=mock_s3_svc)),
             }):
            result = asyncio.run(svc.get_report_download_url(PROJECT_ID, report_id))

        assert result == "https://s3.amazonaws.com/presigned"

    def test_returns_empty_when_no_report(self):
        svc = ReportService()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.get_report_download_url(PROJECT_ID, str(uuid4())))

        assert result == ""

    def test_returns_empty_when_no_s3_key(self):
        svc = ReportService()

        report_row = SimpleNamespace(
            id=str(uuid4()),
            summary=json.dumps({"text": "summary"}),
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = report_row

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.get_report_download_url(PROJECT_ID, str(uuid4())))

        assert result == ""

    def test_returns_empty_on_exception(self):
        svc = ReportService()

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=Exception("boom"))
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            result = asyncio.run(svc.get_report_download_url(PROJECT_ID, str(uuid4())))

        assert result == ""


# ── generate_session_report ──────────────────────────────────────


class TestGenerateSessionReport:
    def test_generates_and_uploads_report(self):
        svc = ReportService()
        svc._persist_report_metadata = AsyncMock()

        mock_s3_svc = MagicMock()
        mock_s3_svc.upload_report = AsyncMock(
            return_value={"key": "reports/org/proj/session/report.pdf"}
        )

        session_data = {
            "session_id": "sess-1",
            "project_id": PROJECT_ID,
            "status": "completed",
            "task": "Fix the bug",
            "session_summary": "Bug was fixed.",
            "results": [],
        }

        with patch.dict("sys.modules", {
            "app.services.s3_service": MagicMock(S3Service=MagicMock(return_value=mock_s3_svc)),
        }):
            result = asyncio.run(svc.generate_session_report(PROJECT_ID, ORG_ID, session_data))

        assert result["report_type"] == "session"
        assert "report_id" in result
        assert result["s3_key"] == "reports/org/proj/session/report.pdf"
        mock_s3_svc.upload_report.assert_awaited_once()
        svc._persist_report_metadata.assert_awaited_once()

    def test_generates_direction_report(self):
        svc = ReportService()
        svc._persist_report_metadata = AsyncMock()

        mock_s3_svc = MagicMock()
        mock_s3_svc.upload_report = AsyncMock(
            return_value={"key": "reports/org/proj/direction/report.pdf"}
        )

        session_data = {
            "session_id": "sess-2",
            "project_id": PROJECT_ID,
            "direction_report": "Focus on scalability.",
            "session_summary": "Review done.",
        }

        with patch.dict("sys.modules", {
            "app.services.s3_service": MagicMock(S3Service=MagicMock(return_value=mock_s3_svc)),
        }):
            result = asyncio.run(svc.generate_direction_report(PROJECT_ID, ORG_ID, session_data))

        assert result["report_type"] == "direction"
        assert result["s3_key"] == "reports/org/proj/direction/report.pdf"


# ── PDF generation helpers ───────────────────────────────────────


class TestPdfGeneration:
    def test_placeholder_pdf(self):
        pdf_bytes = ReportService._placeholder_pdf("Test Title", {"key": "value"})
        assert isinstance(pdf_bytes, bytes)
        text = pdf_bytes.decode("utf-8")
        assert "%PDF" in text
        assert "Test Title" in text

    def test_build_session_pdf_without_reportlab(self):
        svc = ReportService()
        now = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)
        session_data = {
            "session_id": "sess-1",
            "project_id": PROJECT_ID,
            "status": "completed",
            "task": "Test task",
            "session_summary": "Summary here",
            "results": [],
        }

        with patch.dict("sys.modules", {
            "reportlab": None,
            "reportlab.lib": None,
            "reportlab.lib.pagesizes": None,
            "reportlab.lib.styles": None,
            "reportlab.platypus": None,
        }):
            pdf = svc._build_session_pdf("Test Title", session_data, now)

        assert isinstance(pdf, bytes)
        assert b"%PDF" in pdf

    def test_build_direction_pdf_without_reportlab(self):
        svc = ReportService()
        now = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)
        session_data = {
            "direction_report": "Scale the infrastructure",
            "session_summary": "Review complete",
        }

        with patch.dict("sys.modules", {
            "reportlab": None,
            "reportlab.lib": None,
            "reportlab.lib.pagesizes": None,
            "reportlab.lib.styles": None,
            "reportlab.platypus": None,
        }):
            pdf = svc._build_direction_pdf("Direction Report", session_data, now)

        assert isinstance(pdf, bytes)
        assert b"%PDF" in pdf


# ── _persist_report_metadata ─────────────────────────────────────


class TestPersistReportMetadata:
    def test_persists_to_db(self):
        svc = ReportService()

        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            asyncio.run(
                svc._persist_report_metadata(
                    report_id=str(uuid4()),
                    project_id=PROJECT_ID,
                    title="Test Report",
                    summary="summary text",
                    report_type="session",
                    s3_key="reports/key.pdf",
                )
            )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_awaited_once()

    def test_handles_db_error_gracefully(self):
        svc = ReportService()

        mock_session = AsyncMock()
        mock_session.add = MagicMock(side_effect=Exception("DB error"))
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session)

        with patch("app.core.database.async_session_factory", mock_factory):
            asyncio.run(
                svc._persist_report_metadata(
                    report_id=str(uuid4()),
                    project_id=PROJECT_ID,
                    title="Test",
                    summary="",
                    report_type="session",
                    s3_key="",
                )
            )
