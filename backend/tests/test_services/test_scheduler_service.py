"""Unit tests for SchedulerService."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.scheduler_service import (
    ESTIMATED_COST_PER_SESSION_USD,
    SECONDS_PER_DAY,
    SchedulerService,
)


# ── get_schedule_info (pure math) ────────────────────────────────


class TestGetScheduleInfo:
    def setup_method(self):
        self.svc = SchedulerService()

    def test_zero_budget(self):
        info = self.svc.get_schedule_info(0)
        assert info["max_sessions_per_month"] == 0
        assert info["interval_hours"] == 0

    def test_negative_budget(self):
        info = self.svc.get_schedule_info(-50)
        assert info["max_sessions_per_month"] == 0

    def test_small_budget_minimum_one_session(self):
        info = self.svc.get_schedule_info(0.01)
        assert info["max_sessions_per_month"] == 1
        expected_hours = round((30 * SECONDS_PER_DAY) / 3600, 1)
        assert info["interval_hours"] == expected_hours

    def test_exact_one_session_budget(self):
        info = self.svc.get_schedule_info(ESTIMATED_COST_PER_SESSION_USD)
        assert info["max_sessions_per_month"] == 1
        assert info["estimated_cost_per_session"] == ESTIMATED_COST_PER_SESSION_USD

    def test_moderate_budget(self):
        budget = 30.0
        info = self.svc.get_schedule_info(budget)
        expected_sessions = max(1, int(budget / ESTIMATED_COST_PER_SESSION_USD))
        assert info["max_sessions_per_month"] == expected_sessions
        expected_interval = (30 * SECONDS_PER_DAY) / expected_sessions
        assert info["interval_hours"] == round(expected_interval / 3600, 1)

    def test_large_budget(self):
        info = self.svc.get_schedule_info(1000.0)
        assert info["max_sessions_per_month"] > 100
        assert info["interval_hours"] < 24


# ── start / stop ─────────────────────────────────────────────────


class TestStartStop:
    def test_start_creates_scheduler(self):
        svc = SchedulerService()
        mock_scheduler_cls = MagicMock()
        mock_scheduler_instance = MagicMock()
        mock_scheduler_cls.return_value = mock_scheduler_instance

        mock_trigger_cls = MagicMock()

        with patch.dict(
            "sys.modules",
            {
                "apscheduler": MagicMock(),
                "apscheduler.schedulers": MagicMock(),
                "apscheduler.schedulers.asyncio": MagicMock(
                    AsyncIOScheduler=mock_scheduler_cls
                ),
                "apscheduler.triggers": MagicMock(),
                "apscheduler.triggers.interval": MagicMock(
                    IntervalTrigger=mock_trigger_cls
                ),
            },
        ):
            asyncio.run(svc.start())

        assert svc._running is True
        mock_scheduler_instance.start.assert_called_once()

    def test_start_already_running_is_noop(self):
        svc = SchedulerService()
        svc._running = True
        asyncio.run(svc.start())
        assert svc._running is True

    def test_stop_shuts_down_scheduler(self):
        svc = SchedulerService()
        svc._running = True
        svc._scheduler = MagicMock()

        asyncio.run(svc.stop())

        assert svc._running is False
        svc._scheduler.shutdown.assert_called_once_with(wait=False)

    def test_stop_when_not_running_is_noop(self):
        svc = SchedulerService()
        svc._running = False
        asyncio.run(svc.stop())
        assert svc._running is False


# ── _should_execute_now ──────────────────────────────────────────


class TestShouldExecuteNow:
    def setup_method(self):
        self.svc = SchedulerService()

    def test_zero_budget_returns_false(self):
        assert self.svc._should_execute_now({"monthly_budget_usd": 0}) is False

    def test_negative_budget_returns_false(self):
        assert self.svc._should_execute_now({"monthly_budget_usd": -10}) is False

    def test_no_last_run_returns_true(self):
        project = {"monthly_budget_usd": 10.0, "last_execution_at": None}
        assert self.svc._should_execute_now(project) is True

    def test_recent_run_returns_false(self):
        now = datetime.now(timezone.utc)
        project = {
            "monthly_budget_usd": 10.0,
            "last_execution_at": now.isoformat(),
        }
        assert self.svc._should_execute_now(project) is False

    def test_old_run_returns_true(self):
        old = datetime.now(timezone.utc) - timedelta(days=60)
        project = {
            "monthly_budget_usd": 10.0,
            "last_execution_at": old.isoformat(),
        }
        assert self.svc._should_execute_now(project) is True

    def test_datetime_object_last_run(self):
        old = datetime.now(timezone.utc) - timedelta(days=60)
        project = {"monthly_budget_usd": 10.0, "last_execution_at": old}
        assert self.svc._should_execute_now(project) is True

    def test_naive_datetime_last_run(self):
        old = datetime.now() - timedelta(days=60)
        project = {"monthly_budget_usd": 10.0, "last_execution_at": old}
        assert self.svc._should_execute_now(project) is True

    def test_invalid_iso_string_returns_true(self):
        project = {
            "monthly_budget_usd": 10.0,
            "last_execution_at": "not-a-date",
        }
        assert self.svc._should_execute_now(project) is True


# ── _check_and_schedule_projects ─────────────────────────────────


class TestCheckAndScheduleProjects:
    def test_triggers_eligible_projects(self):
        svc = SchedulerService()

        now = datetime.now(timezone.utc)
        projects = [
            {"project_id": "p1", "monthly_budget_usd": 30.0, "last_execution_at": None},
            {"project_id": "p2", "monthly_budget_usd": 0, "last_execution_at": None},
            {
                "project_id": "p3",
                "monthly_budget_usd": 10.0,
                "last_execution_at": now.isoformat(),
            },
        ]

        svc._get_active_projects = AsyncMock(return_value=projects)
        svc._trigger_execution = AsyncMock()

        asyncio.run(svc._check_and_schedule_projects())

        assert svc._trigger_execution.await_count == 1
        triggered_project = svc._trigger_execution.call_args[0][0]
        assert triggered_project["project_id"] == "p1"

    def test_no_projects_does_nothing(self):
        svc = SchedulerService()
        svc._get_active_projects = AsyncMock(return_value=[])
        svc._trigger_execution = AsyncMock()

        asyncio.run(svc._check_and_schedule_projects())

        svc._trigger_execution.assert_not_awaited()


# ── _compose_task_from_feedback ──────────────────────────────────


class TestComposeTask:
    def test_basic_composition(self):
        svc = SchedulerService()
        task = svc._compose_task_from_feedback({"project_id": "p1"})
        assert "p1" in task
        assert "Scheduled iteration" in task

    def test_includes_pending_tasks(self):
        svc = SchedulerService()
        project = {
            "project_id": "p1",
            "pending_tasks": ["Fix login", "Update docs"],
        }
        task = svc._compose_task_from_feedback(project)
        assert "Fix login" in task
        assert "Update docs" in task
