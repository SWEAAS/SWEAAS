"""Unit tests for OrchestrationService."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import app.services.orchestration_service as orch_mod
from app.services.orchestration_service import OrchestrationService

PROJECT_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _reset_sessions():
    """Clear in-memory session store before each test."""
    orch_mod._SESSIONS.clear()
    yield
    orch_mod._SESSIONS.clear()


# ── submit_task ──────────────────────────────────────────────────


def _patch_helpers(svc: OrchestrationService) -> dict[str, AsyncMock]:
    """Replace every private async helper with an AsyncMock."""
    mocks = {}
    mocks["resolve_meta"] = AsyncMock(
        return_value={"github_repo_name": "org/repo", "sentry_project_slug": "slug"}
    )
    mocks["provision"] = AsyncMock(return_value="sbx-123")
    mocks["teardown"] = AsyncMock()
    mocks["s3_ctx"] = AsyncMock(return_value="onboarding context")
    mocks["sentry"] = AsyncMock(return_value=[])
    mocks["feedback"] = AsyncMock(return_value=[])
    mocks["persist"] = AsyncMock()
    mocks["webhook"] = AsyncMock()
    mocks["notify"] = AsyncMock()

    svc._resolve_project_meta = mocks["resolve_meta"]
    svc._provision_sandbox = mocks["provision"]
    svc._teardown_sandbox = mocks["teardown"]
    svc._fetch_onboarding_context = mocks["s3_ctx"]
    svc._fetch_sentry_issues = mocks["sentry"]
    svc._fetch_pending_feedback = mocks["feedback"]
    svc._persist_session = mocks["persist"]
    svc._notify_webhook = mocks["webhook"]
    svc._notify_completion = mocks["notify"]
    svc._get_project_budget = MagicMock(return_value=500_000)
    return mocks


def test_submit_task_happy_path():
    svc = OrchestrationService()
    helpers = _patch_helpers(svc)

    fake_result = {
        "status": "completed",
        "session_summary": "Done.",
        "direction_report": "",
        "results": [{"agent": "test", "output": "ok"}],
        "messages": [],
    }

    fake_graph = AsyncMock()
    fake_graph.ainvoke = AsyncMock(return_value=fake_result)

    with patch(
        "app.services.orchestration_service.build_agent_graph",
        create=True,
    ) as mock_build:
        mock_build.return_value = fake_graph

        with patch.dict(
            "sys.modules",
            {"app.agents.graph": MagicMock(build_agent_graph=mock_build)},
        ):
            result = asyncio.run(svc.submit_task(PROJECT_ID, "Fix the bug"))

    assert result["status"] == "completed"
    assert "session_id" in result
    helpers["resolve_meta"].assert_awaited_once_with(PROJECT_ID)
    helpers["provision"].assert_awaited_once()
    helpers["teardown"].assert_awaited_once()
    helpers["persist"].assert_awaited_once()
    helpers["webhook"].assert_awaited_once()
    helpers["notify"].assert_awaited_once()


def test_submit_task_import_error_returns_stub():
    svc = OrchestrationService()
    _patch_helpers(svc)

    with patch.dict("sys.modules", {"app.agents.graph": None}):
        result = asyncio.run(svc.submit_task(PROJECT_ID, "Do stuff"))

    assert result["status"] == "stub"
    assert PROJECT_ID == result["project_id"]


def test_submit_task_graph_exception_returns_failed():
    svc = OrchestrationService()
    helpers = _patch_helpers(svc)

    def _raise(*a, **kw):
        raise RuntimeError("boom")

    fake_graph = AsyncMock()
    fake_graph.ainvoke = AsyncMock(side_effect=RuntimeError("boom"))

    with patch(
        "app.services.orchestration_service.build_agent_graph",
        create=True,
    ) as mock_build:
        mock_build.return_value = fake_graph
        with patch.dict(
            "sys.modules",
            {"app.agents.graph": MagicMock(build_agent_graph=mock_build)},
        ):
            result = asyncio.run(svc.submit_task(PROJECT_ID, "Crash"))

    assert result["status"] == "failed"
    assert "boom" in result["error"]
    helpers["teardown"].assert_awaited_once()


def test_submit_task_with_feedback_items():
    svc = OrchestrationService()
    _patch_helpers(svc)

    fake_graph = AsyncMock()
    fake_graph.ainvoke = AsyncMock(return_value={"status": "completed", "messages": []})

    with patch(
        "app.services.orchestration_service.build_agent_graph",
        create=True,
    ) as mock_build:
        mock_build.return_value = fake_graph
        with patch.dict(
            "sys.modules",
            {"app.agents.graph": MagicMock(build_agent_graph=mock_build)},
        ):
            result = asyncio.run(
                svc.submit_task(
                    PROJECT_ID,
                    "Address feedback",
                    feedback_items=[{"source": "user", "title": "Bug 1"}],
                )
            )

    assert result["status"] == "completed"
    invoke_kwargs = fake_graph.ainvoke.call_args[0][0]
    assert len(invoke_kwargs["feedback_items"]) >= 1


# ── get_execution_status ─────────────────────────────────────────


def test_get_execution_status_with_active_sessions():
    orch_mod._SESSIONS["s1"] = {"session_id": "s1", "project_id": PROJECT_ID, "status": "running"}
    orch_mod._SESSIONS["s2"] = {"session_id": "s2", "project_id": PROJECT_ID, "status": "completed"}

    svc = OrchestrationService()
    result = asyncio.run(svc.get_execution_status(PROJECT_ID))

    assert result["status"] == "running"
    assert result["active_agents"] == 1
    assert "s1" in result["active_sessions"]


def test_get_execution_status_idle():
    svc = OrchestrationService()
    result = asyncio.run(svc.get_execution_status(PROJECT_ID))

    assert result["status"] == "idle"
    assert result["active_agents"] == 0
    assert result["active_sessions"] == []


# ── list_sessions ────────────────────────────────────────────────


def test_list_sessions_returns_matching_project():
    orch_mod._SESSIONS["s1"] = {
        "session_id": "s1",
        "project_id": PROJECT_ID,
        "status": "completed",
        "task": "Fix things",
        "started_at": "2025-01-01T00:00:00Z",
        "completed_at": "2025-01-01T00:05:00Z",
    }
    orch_mod._SESSIONS["s2"] = {
        "session_id": "s2",
        "project_id": "other-project",
        "status": "completed",
        "task": "Other task",
        "started_at": "2025-01-01T00:00:00Z",
        "completed_at": None,
    }

    svc = OrchestrationService()
    result = asyncio.run(svc.list_sessions(PROJECT_ID))

    assert len(result) == 1
    assert result[0]["session_id"] == "s1"


def test_list_sessions_empty():
    svc = OrchestrationService()
    result = asyncio.run(svc.list_sessions(PROJECT_ID))
    assert result == []
