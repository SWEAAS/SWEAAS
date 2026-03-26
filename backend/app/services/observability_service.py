"""Domain logic for reporting and observability views."""

from collections import defaultdict

from app.schemas.observability_schema import (
    DepartmentMetric,
    ObservabilityOverviewResponse,
    ObservabilityReport,
    ObservabilityReportListResponse,
)
from app.services.seed_data import AGENTS, REPORTS


class ObservabilityService:
    """Aggregates data for operational dashboards."""

    def get_overview(self) -> ObservabilityOverviewResponse:
        departments: dict[str, dict[str, int]] = defaultdict(
            lambda: {"active_agents": 0, "tokens_used_today": 0, "warnings": 0}
        )

        running_tasks = 0
        for agent in AGENTS:
            department_metrics = departments[agent["department"]]
            department_metrics["active_agents"] += 1
            department_metrics["tokens_used_today"] += agent["tokens_used_today"]
            department_metrics["warnings"] += 1 if agent["status"] == "warning" else 0
            running_tasks += sum(1 for activity in agent["recent_activity"] if activity["state"] == "running")

        return ObservabilityOverviewResponse(
            report_generated_at="2026-03-25T12:30:00Z",
            total_active_agents=len(AGENTS),
            total_running_tasks=running_tasks,
            departments=[
                DepartmentMetric(department=department, **metrics)
                for department, metrics in departments.items()
            ],
        )

    def list_reports(self) -> ObservabilityReportListResponse:
        return ObservabilityReportListResponse(
            reports=[ObservabilityReport(**report) for report in REPORTS]
        )
