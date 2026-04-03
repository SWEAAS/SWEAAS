"""Observability endpoint tests."""


def test_overview(client):
    resp = client.get("/api/v1/observability/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_active_agents" in data
    assert "departments" in data
    assert isinstance(data["departments"], list)


def test_reports(client):
    resp = client.get("/api/v1/observability/reports")
    assert resp.status_code == 200
    data = resp.json()
    assert "reports" in data
    assert isinstance(data["reports"], list)


def test_sentry_issues(client):
    """Test GET /observability/sentry/issues with mocked Sentry service."""
    from unittest.mock import AsyncMock, patch
    from app.schemas.observability_schema import SentryIssueListResponse, SentryIssue

    mock_issues = SentryIssueListResponse(
        issues=[
            SentryIssue(
                issue_id="123", title="TypeError in handler", level="error",
                count=5, first_seen="2026-04-01T00:00:00Z", last_seen="2026-04-03T00:00:00Z",
            )
        ]
    )
    with patch(
        "app.services.observability_service.ObservabilityService.list_sentry_issues",
        new_callable=AsyncMock,
        return_value=mock_issues,
    ):
        resp = client.get("/api/v1/observability/sentry/issues")
        assert resp.status_code == 200
        data = resp.json()
        assert "issues" in data
        assert len(data["issues"]) == 1
        assert data["issues"][0]["title"] == "TypeError in handler"


def test_sentry_issues_with_project_slug(client):
    from unittest.mock import AsyncMock, patch
    from app.schemas.observability_schema import SentryIssueListResponse

    mock_issues = SentryIssueListResponse(issues=[])
    with patch(
        "app.services.observability_service.ObservabilityService.list_sentry_issues",
        new_callable=AsyncMock,
        return_value=mock_issues,
    ):
        resp = client.get("/api/v1/observability/sentry/issues?project_slug=my-project")
        assert resp.status_code == 200
        assert resp.json()["issues"] == []
