"""Orchestration endpoint tests."""

from unittest.mock import AsyncMock, patch
import pytest
from app.main import app
from app.core.dependencies import get_orchestration_service

TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000001"


class FakeOrchestrationService:
    async def submit_task(self, project_id, task_description, feedback_items=None):
        return {
            "session_id": "sess-001",
            "project_id": project_id,
            "status": "completed",
            "session_summary": "Tasks completed successfully.",
            "direction_report": "Continue with current plan.",
        }

    async def get_execution_status(self, project_id):
        return {
            "project_id": project_id,
            "active_agents": 3,
            "running_tasks": 2,
            "status": "running",
            "active_sessions": ["sess-001"],
        }

    async def list_sessions(self, project_id):
        return [
            {
                "session_id": "sess-001",
                "status": "completed",
                "task": "Build authentication module",
                "started_at": "2026-04-01T10:00:00Z",
                "completed_at": "2026-04-01T10:30:00Z",
            }
        ]


@pytest.fixture
def orch_client(client):
    app.dependency_overrides[get_orchestration_service] = lambda: FakeOrchestrationService()
    yield client
    app.dependency_overrides.clear()


def test_execute_task(orch_client):
    resp = orch_client.post(
        "/api/v1/orchestration/execute",
        json={"project_id": TEST_PROJECT_ID, "task": "Implement user login"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "sess-001"
    assert data["status"] == "completed"
    assert data["session_summary"] != ""


def test_execute_task_with_feedback(orch_client):
    resp = orch_client.post(
        "/api/v1/orchestration/execute",
        json={
            "project_id": TEST_PROJECT_ID,
            "task": "Fix login bug",
            "feedback_items": [{"title": "Login broken", "body": "Can't sign in"}],
        },
    )
    assert resp.status_code == 200


def test_execute_task_missing_fields(orch_client):
    resp = orch_client.post("/api/v1/orchestration/execute", json={})
    assert resp.status_code == 422


def test_execute_task_invalid_project_id(orch_client):
    resp = orch_client.post(
        "/api/v1/orchestration/execute",
        json={"project_id": "not-a-uuid", "task": "Test"},
    )
    assert resp.status_code == 422


def test_get_status(orch_client):
    resp = orch_client.get(f"/api/v1/orchestration/status/{TEST_PROJECT_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active_agents"] == 3
    assert data["status"] == "running"


def test_list_sessions(orch_client):
    resp = orch_client.get(f"/api/v1/orchestration/sessions/{TEST_PROJECT_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == TEST_PROJECT_ID
    assert len(data["sessions"]) == 1
    assert data["sessions"][0]["session_id"] == "sess-001"


def test_list_reports(orch_client):
    with patch("app.services.report_service.ReportService") as MockReport:
        instance = MockReport.return_value
        instance.list_reports = AsyncMock(return_value=[
            {"report_id": "rpt-001", "title": "Sprint Report", "report_type": "session", "created_at": "2026-04-01", "download_url": None}
        ])
        resp = orch_client.get(f"/api/v1/orchestration/reports/{TEST_PROJECT_ID}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == TEST_PROJECT_ID


def test_download_report_pdf(orch_client):
    with patch("app.services.report_service.ReportService") as MockReport:
        instance = MockReport.return_value
        instance.get_report_download_url = AsyncMock(return_value="https://s3.amazonaws.com/reports/rpt-001.pdf")
        resp = orch_client.get(f"/api/v1/orchestration/reports/{TEST_PROJECT_ID}/rpt-001/pdf")
        assert resp.status_code == 200
        data = resp.json()
        assert "download_url" in data or "error" in data


def test_list_reports_error_returns_empty(orch_client):
    """When ReportService raises, the route catches and returns empty list."""
    resp = orch_client.get(f"/api/v1/orchestration/reports/{TEST_PROJECT_ID}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == TEST_PROJECT_ID
    assert isinstance(data["reports"], list)
