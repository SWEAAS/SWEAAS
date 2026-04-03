"""LangGraph orchestration service — constructs and runs the agent hierarchy.

Handles the full lifecycle: project resolution, S3 context fetch, sandbox
provisioning, feedback injection, graph execution, DB persistence of
tasks/results, report generation, sandbox teardown, and Slack webhook
notification.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# In-memory session tracking (complement to DB persistence)
_SESSIONS: dict[str, dict[str, Any]] = {}


class OrchestrationService:
    """Entry point for executing tasks through the LangGraph agent hierarchy."""

    async def submit_task(
        self,
        project_id: str,
        task_description: str,
        *,
        feedback_items: list[dict] | None = None,
    ) -> dict:
        """Submit a task to the CTO agent and start hierarchical execution.

        Flow:
          1. Generate session_id
          2. Resolve project metadata (repo name, Sentry slug) from DB
          3. Provision E2B sandbox
          4. Fetch onboarding context from S3
          5. Collect pending feedback + Sentry issues
          6. Build and invoke the LangGraph
          7. Persist results and generate reports
          8. Tear down sandbox
          9. Post summary to Slack webhook
        """
        session_id = str(uuid.uuid4())
        started_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            "Session %s — submitting task for project %s: %s",
            session_id, project_id, task_description[:80],
        )

        _SESSIONS[session_id] = {
            "session_id": session_id,
            "project_id": project_id,
            "task": task_description,
            "status": "running",
            "started_at": started_at,
            "completed_at": None,
            "results": None,
        }

        project_meta = await self._resolve_project_meta(project_id)
        repo_name = project_meta.get("github_repo_name", "")
        sentry_slug = project_meta.get("sentry_project_slug", "")

        sandbox_id = await self._provision_sandbox(project_id)

        onboarding_context = await self._fetch_onboarding_context(project_id)

        all_feedback = list(feedback_items or [])
        sentry_feedback = await self._fetch_sentry_issues(sentry_slug or project_id)
        all_feedback.extend(sentry_feedback)
        project_feedback = await self._fetch_pending_feedback(project_id)
        all_feedback.extend(project_feedback)

        budget_remaining = self._get_project_budget(project_id)

        try:
            from app.agents.graph import build_agent_graph

            graph = build_agent_graph(project_id=project_id)

            invoke_kwargs: dict = {}
            if settings.langchain_tracing_v2 and settings.langchain_api_key:
                invoke_kwargs["config"] = {
                    "run_name": f"sweaas-session-{session_id[:8]}",
                    "tags": [
                        f"project:{project_id}",
                        f"session:{session_id}",
                        "orchestration",
                    ],
                    "metadata": {
                        "project_id": project_id,
                        "session_id": session_id,
                    },
                }

            result = await graph.ainvoke(
                {
                    "task": task_description,
                    "project_id": project_id,
                    "session_id": session_id,
                    "sandbox_id": sandbox_id,
                    "repo_name": repo_name,
                    "sentry_project_slug": sentry_slug,
                    "onboarding_context": onboarding_context,
                    "feedback_items": all_feedback,
                    "messages": [],
                    "subtasks": [],
                    "assignments": [],
                    "results": [],
                    "status": "pending",
                    "budget_remaining": budget_remaining,
                },
                **invoke_kwargs,
            )

            completed_at = datetime.now(timezone.utc).isoformat()
            session_data = {
                "session_id": session_id,
                "project_id": project_id,
                "task": task_description,
                "status": result.get("status", "completed"),
                "started_at": started_at,
                "completed_at": completed_at,
                "session_summary": result.get("session_summary", ""),
                "direction_report": result.get("direction_report", ""),
                "results": result.get("results", []),
                "messages_count": len(result.get("messages", [])),
            }
            _SESSIONS[session_id] = session_data

            await self._persist_session(session_data)
            await self._notify_webhook(session_data)
            await self._notify_completion(session_data)

            return session_data

        except ImportError:
            logger.warning("Agent graph not yet available — returning stub.")
            _SESSIONS[session_id]["status"] = "stub"
            return {
                "session_id": session_id,
                "project_id": project_id,
                "status": "stub",
                "session_summary": f"Would execute: {task_description}",
            }
        except Exception as exc:
            logger.error("Orchestration failed for session %s: %s", session_id, exc, exc_info=True)
            _SESSIONS[session_id]["status"] = "failed"
            _SESSIONS[session_id]["error"] = str(exc)
            return {
                "session_id": session_id,
                "project_id": project_id,
                "status": "failed",
                "error": str(exc),
            }
        finally:
            await self._teardown_sandbox(project_id)

    async def get_execution_status(self, project_id: str) -> dict:
        """Check the current status of agent execution for a project."""
        active = [
            s for s in _SESSIONS.values()
            if s["project_id"] == project_id and s["status"] == "running"
        ]
        return {
            "project_id": project_id,
            "active_agents": len(active),
            "running_tasks": len(active),
            "status": "running" if active else "idle",
            "active_sessions": [s["session_id"] for s in active],
        }

    async def list_sessions(self, project_id: str) -> list[dict]:
        """List all past execution sessions for a project."""
        return [
            {
                "session_id": s["session_id"],
                "status": s["status"],
                "task": s.get("task", "")[:200],
                "started_at": s.get("started_at"),
                "completed_at": s.get("completed_at"),
            }
            for s in _SESSIONS.values()
            if s["project_id"] == project_id
        ]

    # ── Internal helpers ──

    async def _resolve_project_meta(self, project_id: str) -> dict:
        """Look up github_repo_name and sentry_project_slug from the Project row."""
        try:
            from sqlalchemy import select
            from app.core.database import async_session_factory
            from app.models.project import Project

            async with async_session_factory() as session:
                result = await session.execute(
                    select(Project).where(Project.id == project_id)
                )
                project = result.scalar_one_or_none()
                if project:
                    return {
                        "github_repo_name": project.github_repo_name or "",
                        "sentry_project_slug": project.sentry_project_slug or "",
                    }
        except Exception as exc:
            logger.debug("Could not resolve project metadata for %s: %s", project_id, exc)
        return {"github_repo_name": "", "sentry_project_slug": ""}

    async def _provision_sandbox(self, project_id: str) -> str:
        """Create or reuse an E2B sandbox for this project."""
        try:
            from app.services.sandbox_service import SandboxService
            svc = SandboxService()
            sandbox = await svc.get_or_create_sandbox(project_id)
            sandbox_id = sandbox if isinstance(sandbox, str) else getattr(sandbox, "id", str(sandbox))
            logger.info("Provisioned sandbox %s for project %s", sandbox_id, project_id)
            return sandbox_id
        except Exception as exc:
            logger.debug("Sandbox provisioning skipped for %s: %s", project_id, exc)
            return ""

    async def _teardown_sandbox(self, project_id: str) -> None:
        """Destroy the E2B sandbox after graph execution."""
        try:
            from app.services.sandbox_service import SandboxService
            svc = SandboxService()
            await svc.destroy_project_sandbox(project_id)
            logger.info("Destroyed sandbox for project %s", project_id)
        except Exception as exc:
            logger.debug("Sandbox teardown skipped for %s: %s", project_id, exc)

    async def _fetch_onboarding_context(self, project_id: str) -> str:
        """Fetch org goals/requirements from S3 if available."""
        try:
            from app.services.s3_service import S3Service
            s3 = S3Service()
            return await s3.get_onboarding_doc(project_id)
        except Exception as exc:
            logger.debug("No S3 onboarding context for %s: %s", project_id, exc)
            return ""

    async def _fetch_sentry_issues(self, project_slug: str) -> list[dict]:
        """Convert Sentry unresolved issues into feedback items."""
        if not project_slug:
            return []
        try:
            from app.services.sentry_service import SentryService
            sentry = SentryService()
            issues = await sentry.list_issues(project_slug=project_slug, limit=10)
            return [
                {
                    "source": "sentry",
                    "title": issue.get("title", "Unknown error"),
                    "body": issue.get("culprit", ""),
                    "priority": "high" if issue.get("level") == "error" else "medium",
                    "external_id": str(issue.get("id", "")),
                }
                for issue in issues
            ]
        except Exception as exc:
            logger.debug("Sentry issues unavailable for %s: %s", project_slug, exc)
            return []

    async def _fetch_pending_feedback(self, project_id: str) -> list[dict]:
        """Pull pending feedback from the feedback store."""
        try:
            from app.services.feedback_service import FeedbackService
            fb_svc = FeedbackService()
            items = fb_svc.list_for_project(project_id)
            return [
                {
                    "source": "user_feedback",
                    "title": item.title,
                    "body": "",
                    "priority": "medium",
                    "feedback_id": item.feedback_id,
                }
                for item in items[:10]
            ]
        except Exception as exc:
            logger.debug("Feedback unavailable for %s: %s", project_id, exc)
            return []

    def _get_project_budget(self, project_id: str) -> int:
        """Get remaining budget tokens for a project from BudgetTracker."""
        try:
            from app.core.llm_budget import budget_tracker
            if budget_tracker.is_initialised:
                snapshots = budget_tracker.all_snapshots()
                total_remaining = sum(
                    (s["daily_token_budget"] - s["tokens_used_today"])
                    for s in snapshots if s
                )
                return max(total_remaining, 0)
        except Exception:
            pass
        return 500_000

    async def _persist_session(self, session_data: dict) -> None:
        """Persist session results to the DB reports table."""
        try:
            from app.core.database import async_session_factory
            from app.models.task import Report

            project_id = uuid.UUID(session_data["project_id"])
            async with async_session_factory() as session:
                report = Report(
                    project_id=project_id,
                    title=f"Session Report — {session_data.get('started_at', 'unknown')[:10]}",
                    summary=json.dumps({
                        "session_id": session_data["session_id"],
                        "task": session_data.get("task", ""),
                        "session_summary": session_data.get("session_summary", ""),
                        "direction_report": session_data.get("direction_report", ""),
                    }),
                    report_type="session",
                )
                session.add(report)
                await session.commit()
                logger.info("Persisted session report for %s", session_data["session_id"])
        except Exception as exc:
            logger.warning("Failed to persist session: %s", exc)

    async def _notify_webhook(self, session_data: dict) -> None:
        """Post session summary to the feedback/Slack webhook."""
        if not settings.feedback_webhook_url:
            return
        try:
            import httpx
            payload = {
                "text": (
                    f"*SWEAAS Session Complete* — Project `{session_data['project_id']}`\n"
                    f"Status: {session_data.get('status', 'unknown')}\n"
                    f"Task: {session_data.get('task', '')[:200]}\n"
                    f"Session: {session_data['session_id']}"
                ),
                "session_id": session_data["session_id"],
                "project_id": session_data["project_id"],
            }
            async with httpx.AsyncClient() as client:
                await client.post(settings.feedback_webhook_url, json=payload, timeout=10)
        except Exception as exc:
            logger.warning("Webhook notification failed: %s", exc)

    async def _notify_completion(self, session_data: dict) -> None:
        """Send in-app / email / SMS notifications when an orchestration session finishes."""
        try:
            from app.core.database import async_session_factory
            from app.models.user import User
            from app.services.notification_service import NotificationService
            from sqlalchemy import select

            project_id = session_data["project_id"]
            summary = session_data.get("session_summary", session_data.get("task", ""))[:500]

            async with async_session_factory() as db:
                result = await db.execute(select(User).limit(1))
                user = result.scalar_one_or_none()
                if not user or not user.organization_id:
                    return

                svc = NotificationService()
                await svc.notify_orchestration_complete(
                    org_id=user.organization_id,
                    project_id=project_id,
                    session_id=session_data["session_id"],
                    summary=summary,
                    db=db,
                )
                await db.commit()
        except Exception as exc:
            logger.warning("Session completion notification failed: %s", exc)
