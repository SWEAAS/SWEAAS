"""Budget-based agent scheduling — periodic wake-ups to iterate on projects.

Uses APScheduler (async) to schedule orchestration sessions based on
the project's monthly budget and estimated cost per session.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ESTIMATED_TOKENS_PER_SESSION = 50_000
ESTIMATED_COST_PER_SESSION_USD = 0.15
SECONDS_PER_DAY = 86_400


class SchedulerService:
    """Manages periodic agent wake-ups based on project budgets.

    Scheduling formula:
        max_sessions_per_month = monthly_budget_usd / cost_per_session
        interval_seconds = (30 * 86400) / max_sessions_per_month
    """

    def __init__(self) -> None:
        self._scheduler = None
        self._running = False

    async def start(self) -> None:
        """Start the APScheduler background scheduler."""
        if self._running:
            return

        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler
            from apscheduler.triggers.interval import IntervalTrigger

            self._scheduler = AsyncIOScheduler()

            self._scheduler.add_job(
                self._check_and_schedule_projects,
                IntervalTrigger(minutes=15),
                id="project_scheduler",
                replace_existing=True,
            )

            self._scheduler.start()
            self._running = True
            logger.info("SchedulerService started — checking projects every 15 minutes")
        except ImportError:
            logger.warning("APScheduler not installed — scheduling disabled")
        except Exception as exc:
            logger.error("Failed to start scheduler: %s", exc)

    async def stop(self) -> None:
        """Shut down the scheduler gracefully."""
        if self._scheduler and self._running:
            self._scheduler.shutdown(wait=False)
            self._running = False
            logger.info("SchedulerService stopped")

    async def _check_and_schedule_projects(self) -> None:
        """Check all active projects and trigger execution if scheduled."""
        projects = await self._get_active_projects()

        for project in projects:
            project_id = project.get("project_id", "")
            monthly_budget = project.get("monthly_budget_usd", 0)

            if monthly_budget <= 0:
                continue

            if self._should_execute_now(project):
                logger.info(
                    "Scheduler triggering execution for project %s (budget: $%.2f/mo)",
                    project_id,
                    monthly_budget,
                )
                await self._trigger_execution(project)

    def _should_execute_now(self, project: dict) -> bool:
        """Determine if a project should be executed based on budget interval."""
        monthly_budget = project.get("monthly_budget_usd", 0)
        if monthly_budget <= 0:
            return False

        max_sessions = max(1, int(monthly_budget / ESTIMATED_COST_PER_SESSION_USD))
        interval_seconds = (30 * SECONDS_PER_DAY) / max_sessions

        last_run = project.get("last_execution_at")
        if last_run is None:
            return True

        if isinstance(last_run, str):
            try:
                last_run = datetime.fromisoformat(last_run)
            except ValueError:
                return True

        now = datetime.now(timezone.utc)
        if last_run.tzinfo is None:
            last_run = last_run.replace(tzinfo=timezone.utc)
        elapsed = (now - last_run).total_seconds()

        return elapsed >= interval_seconds

    async def _trigger_execution(self, project: dict) -> None:
        """Submit a task to the OrchestrationService for a project."""
        try:
            from app.services.orchestration_service import OrchestrationService

            svc = OrchestrationService()
            task = self._compose_task_from_feedback(project)

            await svc.submit_task(
                project_id=project["project_id"],
                task_description=task,
            )

            await self._persist_last_execution(project["project_id"])
        except Exception as exc:
            logger.error(
                "Scheduled execution failed for project %s: %s",
                project.get("project_id"),
                exc,
            )

    async def _persist_last_execution(self, project_id: str) -> None:
        """Write last_execution_at back to the ProjectConfig row."""
        try:
            from sqlalchemy import update
            from app.core.database import async_session_factory
            from app.models.project import Project, ProjectConfig

            async with async_session_factory() as session:
                await session.execute(
                    update(ProjectConfig)
                    .where(ProjectConfig.project_id == project_id)
                    .values(last_execution_at=datetime.now(timezone.utc))
                )
                await session.commit()
        except Exception as exc:
            logger.warning("Failed to persist last_execution_at for %s: %s", project_id, exc)

    def _compose_task_from_feedback(self, project: dict) -> str:
        """Build a task description from pending feedback and project state."""
        parts = [
            f"Scheduled iteration for project {project.get('project_id', 'unknown')}.",
            "Review pending feedback, fix bugs from Sentry, and continue with planned work.",
        ]

        pending_tasks = project.get("pending_tasks", [])
        if pending_tasks:
            parts.append("Pending tasks: " + ", ".join(str(t)[:100] for t in pending_tasks[:5]))

        return " ".join(parts)

    async def _get_active_projects(self) -> list[dict[str, Any]]:
        """Fetch active projects with their budget configuration.

        Attempts DB query; falls back to empty list in dev mode.
        """
        try:
            from sqlalchemy import select
            from app.core.database import async_session_factory
            from app.models.project import Project, ProjectConfig

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Project, ProjectConfig)
                    .outerjoin(ProjectConfig, Project.id == ProjectConfig.project_id)
                )
                rows = result.all()
                return [
                    {
                        "project_id": str(proj.id),
                        "monthly_budget_usd": (
                            config.monthly_budget_usd if config else 0
                        ),
                        "last_execution_at": (
                            config.last_execution_at if config else None
                        ),
                        "pending_tasks": [],
                    }
                    for proj, config in rows
                ]
        except Exception as exc:
            logger.debug("Could not fetch active projects: %s", exc)
            return []

    def get_schedule_info(self, monthly_budget_usd: float) -> dict:
        """Calculate scheduling parameters for a given monthly budget."""
        if monthly_budget_usd <= 0:
            return {
                "max_sessions_per_month": 0,
                "interval_hours": 0,
                "estimated_cost_per_session": ESTIMATED_COST_PER_SESSION_USD,
            }

        max_sessions = max(1, int(monthly_budget_usd / ESTIMATED_COST_PER_SESSION_USD))
        interval_seconds = (30 * SECONDS_PER_DAY) / max_sessions
        interval_hours = round(interval_seconds / 3600, 1)

        return {
            "max_sessions_per_month": max_sessions,
            "interval_hours": interval_hours,
            "estimated_cost_per_session": ESTIMATED_COST_PER_SESSION_USD,
        }


# Module-level singleton
scheduler_service = SchedulerService()
