"""Domain logic for reporting, observability dashboards, and Sentry integration."""

import logging
from collections import defaultdict
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.agent import AgentConfig, AgentSession
from app.models.task import Report
from app.schemas.observability_schema import (
    DepartmentMetric,
    ObservabilityOverviewResponse,
    ObservabilityReport,
    ObservabilityReportListResponse,
    SentryIssue,
    SentryIssueListResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class ObservabilityService:
    """Aggregates data for operational dashboards and Sentry error querying."""

    async def get_overview(self, db: AsyncSession, project_id: UUID | None = None) -> ObservabilityOverviewResponse:
        stmt = select(AgentConfig)
        if project_id:
            stmt = stmt.where(AgentConfig.project_id == project_id)
        result = await db.execute(stmt)
        agents = result.scalars().all()

        departments: dict[str, dict[str, int]] = defaultdict(
            lambda: {"active_agents": 0, "tokens_used_today": 0, "warnings": 0}
        )
        for agent in agents:
            dept = departments[agent.department]
            dept["active_agents"] += 1
            dept["tokens_used_today"] += agent.tokens_used_today
            dept["warnings"] += 1 if agent.status == "warning" else 0

        running_stmt = select(AgentSession).where(AgentSession.status == "running")
        if project_id and agents:
            agent_ids = [a.id for a in agents]
            running_stmt = running_stmt.where(AgentSession.agent_id.in_(agent_ids))
        running_result = await db.execute(running_stmt)
        running_tasks = len(running_result.scalars().all())

        return ObservabilityOverviewResponse(
            report_generated_at=datetime.now(timezone.utc).isoformat(),
            total_active_agents=len(agents),
            total_running_tasks=running_tasks,
            departments=[
                DepartmentMetric(department=dept, **metrics)
                for dept, metrics in departments.items()
            ],
        )

    async def list_reports(self, db: AsyncSession, project_id: UUID | None = None) -> ObservabilityReportListResponse:
        stmt = select(Report).order_by(Report.created_at.desc()).limit(50)
        if project_id:
            stmt = stmt.where(Report.project_id == project_id)
        result = await db.execute(stmt)
        reports = result.scalars().all()

        return ObservabilityReportListResponse(
            reports=[
                ObservabilityReport(
                    report_id=str(r.id),
                    title=r.title,
                    summary=r.summary or "",
                    report_type=r.report_type or "daily",
                    created_at=r.created_at.isoformat() if r.created_at else "",
                )
                for r in reports
            ]
        )

    async def list_sentry_issues(
        self,
        project_slug: str | None = None,
    ) -> SentryIssueListResponse:
        if not settings.sentry_auth_token:
            return SentryIssueListResponse(issues=[])

        slug = project_slug or settings.sentry_project
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://sentry.io/api/0/projects/{settings.sentry_org}/{slug}/issues/",
                    headers={"Authorization": f"Bearer {settings.sentry_auth_token}"},
                    params={"query": "is:unresolved", "limit": 25},
                )
                if resp.status_code in (404, 403):
                    logger.warning(
                        "Sentry project '%s/%s' not found or inaccessible (HTTP %d) — returning empty",
                        settings.sentry_org, slug, resp.status_code,
                    )
                    return SentryIssueListResponse(issues=[])
                resp.raise_for_status()
                issues = [
                    SentryIssue(
                        issue_id=i["id"],
                        title=i["title"],
                        level=i["level"],
                        count=i["count"],
                        first_seen=i["firstSeen"],
                        last_seen=i["lastSeen"],
                    )
                    for i in resp.json()
                ]
                return SentryIssueListResponse(issues=issues)
        except httpx.TransportError as exc:
            logger.warning("Sentry request failed (transport error) — returning empty: %s", exc)
            return SentryIssueListResponse(issues=[])
