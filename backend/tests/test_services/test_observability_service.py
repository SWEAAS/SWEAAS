"""Unit tests for ObservabilityService."""

import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

import httpx
import pytest

from app.services.observability_service import ObservabilityService
from app.services.seed_data import AGENTS, REPORTS


class TestGetOverview:
    def test_total_active_agents(self):
        svc = ObservabilityService()
        overview = svc.get_overview()
        assert overview.total_active_agents == len(AGENTS)

    def test_departments_aggregated(self):
        svc = ObservabilityService()
        overview = svc.get_overview()
        dept_names = {d.department for d in overview.departments}
        assert "engineering" in dept_names
        assert "marketing" in dept_names
        assert "product" in dept_names
        assert "support" in dept_names

    def test_running_tasks_counted(self):
        svc = ObservabilityService()
        overview = svc.get_overview()
        expected_running = sum(
            1
            for agent in AGENTS
            for a in agent["recent_activity"]
            if a["state"] == "running"
        )
        assert overview.total_running_tasks == expected_running

    def test_tokens_summed_per_department(self):
        svc = ObservabilityService()
        overview = svc.get_overview()
        eng_dept = next(d for d in overview.departments if d.department == "engineering")
        expected = sum(
            a["tokens_used_today"] for a in AGENTS if a["department"] == "engineering"
        )
        assert eng_dept.tokens_used_today == expected

    def test_warnings_counted(self):
        svc = ObservabilityService()
        overview = svc.get_overview()
        mkt_dept = next(d for d in overview.departments if d.department == "marketing")
        expected_warnings = sum(
            1
            for a in AGENTS
            if a["department"] == "marketing" and a["status"] == "warning"
        )
        assert mkt_dept.warnings == expected_warnings


class TestListReports:
    def test_returns_seed_reports(self):
        svc = ObservabilityService()
        report_list = svc.list_reports()
        assert len(report_list.reports) == len(REPORTS)

    def test_report_fields(self):
        svc = ObservabilityService()
        report_list = svc.list_reports()
        first = report_list.reports[0]
        assert first.report_id == "rpt-001"
        assert first.title == "Daily operations summary"
        assert first.report_type == "daily"


class TestListSentryIssues:
    def test_empty_when_no_auth_token(self):
        with patch("app.services.observability_service.settings") as mock_settings:
            mock_settings.sentry_auth_token = ""
            svc = ObservabilityService()
            result = asyncio.run(svc.list_sentry_issues())
            assert result.issues == []

    @patch("app.services.observability_service.httpx.AsyncClient")
    def test_returns_issues_from_sentry(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = [
            {
                "id": "100",
                "title": "NullPointerException",
                "level": "error",
                "count": 42,
                "firstSeen": "2026-03-30T10:00:00Z",
                "lastSeen": "2026-03-31T12:00:00Z",
            },
        ]

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with patch("app.services.observability_service.settings") as mock_settings:
            mock_settings.sentry_auth_token = "token-abc"
            mock_settings.sentry_org = "my-org"
            mock_settings.sentry_project = "sweaas"

            svc = ObservabilityService()
            result = asyncio.run(svc.list_sentry_issues())

        assert len(result.issues) == 1
        assert result.issues[0].issue_id == "100"
        assert result.issues[0].title == "NullPointerException"
        assert result.issues[0].count == 42

    @patch("app.services.observability_service.httpx.AsyncClient")
    def test_uses_provided_project_slug(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = []

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with patch("app.services.observability_service.settings") as mock_settings:
            mock_settings.sentry_auth_token = "token-abc"
            mock_settings.sentry_org = "my-org"
            mock_settings.sentry_project = "sweaas"

            svc = ObservabilityService()
            asyncio.run(svc.list_sentry_issues(project_slug="customer-proj"))

        call_args = mock_client.get.call_args
        assert "customer-proj" in call_args[0][0]

    @patch("app.services.observability_service.httpx.AsyncClient")
    def test_returns_empty_on_404(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 404

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with patch("app.services.observability_service.settings") as mock_settings:
            mock_settings.sentry_auth_token = "token-abc"
            mock_settings.sentry_org = "my-org"
            mock_settings.sentry_project = "sweaas"

            svc = ObservabilityService()
            result = asyncio.run(svc.list_sentry_issues())
            assert result.issues == []

    @patch("app.services.observability_service.httpx.AsyncClient")
    def test_returns_empty_on_transport_error(self, mock_client_cls):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("connection refused")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        with patch("app.services.observability_service.settings") as mock_settings:
            mock_settings.sentry_auth_token = "token-abc"
            mock_settings.sentry_org = "my-org"
            mock_settings.sentry_project = "sweaas"

            svc = ObservabilityService()
            result = asyncio.run(svc.list_sentry_issues())
            assert result.issues == []
