"""Domain logic for reporting, observability dashboards, and Sentry integration."""

import logging
from collections import defaultdict

import httpx

from app.core.config import get_settings
from app.schemas.observability_schema import (
    DepartmentMetric,
    ObservabilityOverviewResponse,
    ObservabilityReport,
    ObservabilityReportListResponse,
    SentryIssue,
    SentryIssueListResponse,
)
from app.services.seed_data import AGENTS, REPORTS

logger = logging.getLogger(__name__)
settings = get_settings()


class ObservabilityService:
    """Aggregates data for operational dashboards and Sentry error querying."""

    def get_overview(self) -> ObservabilityOverviewResponse:
        departments: dict[str, dict[str, int]] = defaultdict(
            lambda: {"active_agents": 0, "tokens_used_today": 0, "warnings": 0}
        )
        running_tasks = 0
        for agent in AGENTS:
            dept = departments[agent["department"]]
            dept["active_agents"] += 1
            dept["tokens_used_today"] += agent["tokens_used_today"]
            dept["warnings"] += 1 if agent["status"] == "warning" else 0
            running_tasks += sum(
                1 for a in agent["recent_activity"] if a["state"] == "running"
            )

        return ObservabilityOverviewResponse(
            report_generated_at="2026-03-31T12:30:00Z",
            total_active_agents=len(AGENTS),
            total_running_tasks=running_tasks,
            departments=[
                DepartmentMetric(department=dept, **metrics)
                for dept, metrics in departments.items()
            ],
        )

    def list_reports(self) -> ObservabilityReportListResponse:
        return ObservabilityReportListResponse(
            reports=[ObservabilityReport(**r) for r in REPORTS]
        )

    async def list_sentry_issues(self) -> SentryIssueListResponse:
        """Fetch unresolved Sentry issues for the SWEAAS project.

        Agents can use this data to autonomously discover and fix bugs.
        Requires SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT.
        """
        if not settings.sentry_auth_token:
            return SentryIssueListResponse(issues=[])

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://sentry.io/api/0/projects/{settings.sentry_org}/{settings.sentry_project}/issues/",
                headers={"Authorization": f"Bearer {settings.sentry_auth_token}"},
                params={"query": "is:unresolved", "limit": 25},
            )
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
