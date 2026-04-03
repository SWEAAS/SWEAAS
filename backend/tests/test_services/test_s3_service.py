"""Unit tests for S3Service — document storage and presigned URLs."""

import asyncio
import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.s3_service import S3Service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _service_with_client(mock_client):
    """Return an S3Service whose boto3 client is pre-set to *mock_client*."""
    svc = S3Service()
    svc._client = mock_client
    return svc


def _service_without_client():
    """Return an S3Service with no boto3 client (dev mode)."""
    svc = S3Service()
    svc._client = None
    return svc


# ---------------------------------------------------------------------------
# _get_client
# ---------------------------------------------------------------------------

class TestGetClient:

    def test_creates_client_once_and_caches(self):
        mock_boto_client = MagicMock()
        mock_boto3 = MagicMock()
        mock_boto3.client.return_value = mock_boto_client

        with patch.dict(sys.modules, {"boto3": mock_boto3}):
            svc = S3Service()
            c1 = svc._get_client()
            c2 = svc._get_client()

        mock_boto3.client.assert_called_once_with("s3")
        assert c1 is c2 is mock_boto_client

    def test_returns_none_when_import_fails(self):
        svc = S3Service()
        svc._client = None

        with patch.dict(sys.modules, {"boto3": None}):
            result = svc._get_client()
        assert result is None


# ---------------------------------------------------------------------------
# Dev mode (client is None)
# ---------------------------------------------------------------------------

class TestDevMode:

    def test_upload_onboarding_doc_dev(self):
        svc = _service_without_client()
        result = asyncio.run(svc.upload_onboarding_doc("org-1", "proj-1", "hello"))
        assert result["status"] == "dev-mode"
        assert "onboarding/" in result["key"]

    def test_get_onboarding_doc_dev(self):
        svc = _service_without_client()
        result = asyncio.run(svc.get_onboarding_doc("proj-1"))
        assert result == ""

    def test_upload_report_dev(self):
        svc = _service_without_client()
        result = asyncio.run(svc.upload_report("org-1", "proj-1", b"pdf"))
        assert result["status"] == "dev-mode"
        assert "reports/" in result["key"]

    def test_get_report_url_dev(self):
        svc = _service_without_client()
        url = asyncio.run(svc.get_report_url("reports/org/proj/report.pdf"))
        assert "dev-mode=true" in url

    def test_list_reports_dev(self):
        svc = _service_without_client()
        result = asyncio.run(svc.list_reports("proj-1"))
        assert result == []


# ---------------------------------------------------------------------------
# upload_onboarding_doc
# ---------------------------------------------------------------------------

class TestUploadOnboardingDoc:

    def test_uploads_string_content(self):
        mock_client = MagicMock()
        svc = _service_with_client(mock_client)
        result = asyncio.run(svc.upload_onboarding_doc("org-1", "proj-1", "doc text"))

        assert result["status"] == "uploaded"
        mock_client.put_object.assert_called_once()
        kwargs = mock_client.put_object.call_args[1]
        assert kwargs["Key"] == "onboarding/org-1/proj-1/context.pdf"
        assert kwargs["Body"] == b"doc text"
        assert kwargs["ContentType"] == "application/pdf"

    def test_uploads_bytes_content(self):
        mock_client = MagicMock()
        svc = _service_with_client(mock_client)
        result = asyncio.run(svc.upload_onboarding_doc("o", "p", b"\x00\x01"))

        kwargs = mock_client.put_object.call_args[1]
        assert kwargs["Body"] == b"\x00\x01"
        assert result["status"] == "uploaded"


# ---------------------------------------------------------------------------
# get_onboarding_doc
# ---------------------------------------------------------------------------

class TestGetOnboardingDoc:

    def test_finds_matching_doc(self):
        mock_client = MagicMock()
        body_stream = MagicMock()
        body_stream.read.return_value = b"onboarding content"
        mock_client.list_objects_v2.return_value = {
            "Contents": [
                {"Key": "onboarding/org-1/proj-1/context.pdf"},
            ]
        }
        mock_client.get_object.return_value = {"Body": body_stream}
        svc = _service_with_client(mock_client)

        result = asyncio.run(svc.get_onboarding_doc("proj-1"))
        assert result == "onboarding content"

    def test_returns_empty_when_not_found(self):
        mock_client = MagicMock()
        mock_client.list_objects_v2.return_value = {"Contents": []}
        svc = _service_with_client(mock_client)
        assert asyncio.run(svc.get_onboarding_doc("proj-x")) == ""

    def test_returns_empty_on_exception(self):
        mock_client = MagicMock()
        mock_client.list_objects_v2.side_effect = Exception("access denied")
        svc = _service_with_client(mock_client)
        assert asyncio.run(svc.get_onboarding_doc("proj-x")) == ""


# ---------------------------------------------------------------------------
# upload_report
# ---------------------------------------------------------------------------

class TestUploadReport:

    def test_uploads_pdf_bytes(self):
        mock_client = MagicMock()
        svc = _service_with_client(mock_client)
        result = asyncio.run(svc.upload_report("org-2", "proj-2", b"pdfdata", "weekly"))

        assert result["status"] == "uploaded"
        kwargs = mock_client.put_object.call_args[1]
        assert "reports/org-2/proj-2/" in kwargs["Key"]
        assert "_weekly.pdf" in kwargs["Key"]
        assert kwargs["Body"] == b"pdfdata"


# ---------------------------------------------------------------------------
# get_report_url
# ---------------------------------------------------------------------------

class TestGetReportURL:

    def test_returns_presigned_url(self):
        mock_client = MagicMock()
        mock_client.generate_presigned_url.return_value = "https://s3.amazonaws.com/signed"
        svc = _service_with_client(mock_client)

        url = asyncio.run(svc.get_report_url("reports/k.pdf", expires_in=7200))
        assert url == "https://s3.amazonaws.com/signed"
        mock_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "sweaas-documents", "Key": "reports/k.pdf"},
            ExpiresIn=7200,
        )


# ---------------------------------------------------------------------------
# list_reports
# ---------------------------------------------------------------------------

class TestListReports:

    def test_filters_by_project_id(self):
        mock_client = MagicMock()
        mock_client.list_objects_v2.return_value = {
            "Contents": [
                {
                    "Key": "reports/org-1/proj-A/2025-01-01_session.pdf",
                    "LastModified": datetime(2025, 1, 1, tzinfo=timezone.utc),
                    "Size": 1024,
                },
                {
                    "Key": "reports/org-1/proj-B/2025-01-02_session.pdf",
                    "LastModified": datetime(2025, 1, 2, tzinfo=timezone.utc),
                    "Size": 2048,
                },
            ]
        }
        svc = _service_with_client(mock_client)
        results = asyncio.run(svc.list_reports("proj-A"))

        assert len(results) == 1
        assert results[0]["key"] == "reports/org-1/proj-A/2025-01-01_session.pdf"

    def test_returns_empty_on_exception(self):
        mock_client = MagicMock()
        mock_client.list_objects_v2.side_effect = Exception("timeout")
        svc = _service_with_client(mock_client)
        assert asyncio.run(svc.list_reports("proj")) == []
