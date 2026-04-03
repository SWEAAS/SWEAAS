"""Domain logic for onboarding workflows."""

import json
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.onboarding_schema import (
    CTOAssignmentPatchRequest,
    DepartmentOption,
    OnboardingAssessmentRequest,
    OnboardingAssessmentResponse,
    OnboardingContactRequest,
    OnboardingContactResponse,
    TeamOnboardingConfigRequest,
    TeamOnboardingConfigResponse,
)
from app.services.cost_estimator import estimate_monthly_cost

_CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "team_onboarding"


class OnboardingService:
    """Provides onboarding recommendations and intake handling."""

    def summarize_replica_usage(self, replica_id: str) -> dict[str, int]:
        organization_count = 0
        cto_assignment_count = 0
        team_assignment_count = 0

        if not _CACHE_DIR.exists():
            return {
                "organization_count": 0,
                "cto_assignment_count": 0,
                "team_assignment_count": 0,
                "total_assignment_count": 0,
            }

        for config_path in _CACHE_DIR.glob("*.json"):
            try:
                raw = json.loads(config_path.read_text(encoding="utf-8"))
                config = TeamOnboardingConfigResponse(**raw)
            except (OSError, json.JSONDecodeError, ValueError):
                continue

            cto_matches = 1 if config.cto_assignment and config.cto_assignment.replica_id == replica_id else 0
            team_matches = sum(1 for assignment in config.assignments if assignment.replica_id == replica_id)
            total_matches = cto_matches + team_matches
            if total_matches == 0:
                continue

            organization_count += 1
            cto_assignment_count += cto_matches
            team_assignment_count += team_matches

        return {
            "organization_count": organization_count,
            "cto_assignment_count": cto_assignment_count,
            "team_assignment_count": team_assignment_count,
            "total_assignment_count": cto_assignment_count + team_assignment_count,
        }

    def list_departments(self) -> list[DepartmentOption]:
        return [
            DepartmentOption(key="engineering", label="Engineering", suggested_agents=3),
            DepartmentOption(key="marketing", label="Marketing", suggested_agents=2),
            DepartmentOption(key="product", label="Product", suggested_agents=2),
            DepartmentOption(key="support", label="Customer success & support", suggested_agents=2),
        ]

    def assess(self, request: OnboardingAssessmentRequest) -> OnboardingAssessmentResponse:
        estimated_agent_count = max(3, min(request.team_size // 5, 25))
        estimated_cost = estimate_monthly_cost(
            agent_count=estimated_agent_count,
            budget_usd=request.monthly_budget_usd,
        )

        rollout = [
            "Start with Engineering to validate observability, token policy, and change workflows.",
            "Add Marketing once budget alerts and campaign reporting are stable.",
            "Enable Product after roadmap visibility and meeting automation are configured.",
        ]
        if request.needs_onboarding_call:
            rollout.append(
                "Schedule a guided onboarding call to review calendars, email, and "
                "budget guardrails."
            )

        notes = [
            "Collect a calendar-capable email during onboarding so invites can be automated.",
            "Define strike thresholds before launch so overages are visible in the frontend.",
        ]

        return OnboardingAssessmentResponse(
            company_name=request.company_name,
            recommended_departments=self.list_departments(),
            suggested_rollout=rollout,
            estimated_agent_count=estimated_agent_count,
            estimated_monthly_cost_usd=estimated_cost,
            notes=notes,
        )

    def capture_contact(self, request: OnboardingContactRequest) -> OnboardingContactResponse:
        next_step = (
            f"Use {request.calendar_email} to send a scheduling link "
            f"during {request.preferred_timeframe}."
        )
        return OnboardingContactResponse(status="received", next_step=next_step)

    def get_team_config(self, organization_id: str) -> TeamOnboardingConfigResponse:
        config_path = self._get_config_path(organization_id)
        if not config_path.exists():
            return TeamOnboardingConfigResponse()

        raw = json.loads(config_path.read_text(encoding="utf-8"))
        return TeamOnboardingConfigResponse(**raw)

    def save_team_config(
        self,
        organization_id: str,
        request: TeamOnboardingConfigRequest,
    ) -> TeamOnboardingConfigResponse:
        self._validate_assignments(request.cto_assignment, request.assignments)

        response = TeamOnboardingConfigResponse(
            completed=request.completed,
            company_size=request.company_size,
            overall_budget_usd=request.overall_budget_usd,
            department_sizes=request.department_sizes,
            cto_assignment=request.cto_assignment,
            assignments=request.assignments,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        self._write_config(organization_id, response)
        return response

    def patch_cto_assignment(
        self,
        organization_id: str,
        request: CTOAssignmentPatchRequest,
    ) -> TeamOnboardingConfigResponse:
        current = self.get_team_config(organization_id)
        self._validate_assignments(request.cto_assignment, current.assignments)

        response = TeamOnboardingConfigResponse(
            completed=current.completed,
            company_size=current.company_size,
            overall_budget_usd=current.overall_budget_usd,
            department_sizes=current.department_sizes,
            cto_assignment=request.cto_assignment,
            assignments=current.assignments,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        self._write_config(organization_id, response)
        return response

    def _get_config_path(self, organization_id: str) -> Path:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        safe_org_id = "".join(char for char in organization_id if char.isalnum() or char in ("-", "_"))
        return _CACHE_DIR / f"{safe_org_id}.json"

    def _write_config(
        self,
        organization_id: str,
        response: TeamOnboardingConfigResponse,
    ) -> None:
        config_path = self._get_config_path(organization_id)
        config_path.write_text(
            json.dumps(response.model_dump(mode="json"), indent=2),
            encoding="utf-8",
        )

    def _validate_assignments(self, cto_assignment, assignments) -> None:
        seen_agent_ids: set[str] = set()

        if cto_assignment:
            seen_agent_ids.add(cto_assignment.agent_id)

        for assignment in assignments:
            if assignment.agent_id in seen_agent_ids:
                raise ValueError(f"Duplicate agent assignment detected for {assignment.agent_id}.")
            seen_agent_ids.add(assignment.agent_id)
