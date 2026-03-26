"""Dependency providers for route handlers."""

from functools import lru_cache

from app.services.agent_service import AgentService
from app.services.budget_service import BudgetService
from app.services.communication_service import CommunicationService
from app.services.observability_service import ObservabilityService
from app.services.onboarding_service import OnboardingService


@lru_cache
def get_agent_service() -> AgentService:
    return AgentService()


@lru_cache
def get_budget_service() -> BudgetService:
    return BudgetService()


@lru_cache
def get_onboarding_service() -> OnboardingService:
    return OnboardingService()


@lru_cache
def get_communication_service() -> CommunicationService:
    return CommunicationService()


@lru_cache
def get_observability_service() -> ObservabilityService:
    return ObservabilityService()
