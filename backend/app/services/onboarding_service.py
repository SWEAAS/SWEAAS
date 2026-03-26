"""Domain logic for onboarding workflows."""

from app.schemas.onboarding_schema import (
    DepartmentOption,
    OnboardingAssessmentRequest,
    OnboardingAssessmentResponse,
    OnboardingContactRequest,
    OnboardingContactResponse,
)


class OnboardingService:
    """Provides onboarding recommendations and intake handling."""

    def list_departments(self) -> list[DepartmentOption]:
        return [
            DepartmentOption(key="engineering", label="Engineering", suggested_agents=3),
            DepartmentOption(key="marketing", label="Marketing", suggested_agents=2),
            DepartmentOption(key="product", label="Product", suggested_agents=2),
        ]

    def assess(self, request: OnboardingAssessmentRequest) -> OnboardingAssessmentResponse:
        estimated_agent_count = max(3, min(request.team_size // 5, 25))
        rollout = [
            "Start with Engineering to validate observability, token policy, and change workflows.",
            "Add Marketing once budget alerts and campaign reporting are stable.",
            "Enable Product after roadmap visibility and meeting automation are configured.",
        ]
        if request.needs_onboarding_call:
            rollout.append("Schedule a guided onboarding call to review calendars, email, and budget guardrails.")

        notes = [
            "Collect a calendar-capable email during onboarding so invites can be automated.",
            "Define strike thresholds before launch so overages are visible in the frontend.",
        ]

        return OnboardingAssessmentResponse(
            company_name=request.company_name,
            recommended_departments=self.list_departments(),
            suggested_rollout=rollout,
            estimated_agent_count=estimated_agent_count,
            notes=notes,
        )

    def capture_contact(self, request: OnboardingContactRequest) -> OnboardingContactResponse:
        next_step = (
            f"Use {request.calendar_email} to send a scheduling link during {request.preferred_timeframe}."
        )
        return OnboardingContactResponse(status="received", next_step=next_step)
