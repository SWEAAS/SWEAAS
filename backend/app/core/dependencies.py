"""FastAPI dependency injection factories."""

from app.services.agent_service import AgentService
from app.services.budget_service import BudgetService
from app.services.communication_service import CommunicationService
from app.services.github_service import GitHubService
from app.services.memory_service import MemoryService
from app.services.observability_service import ObservabilityService
from app.services.onboarding_service import OnboardingService
from app.services.orchestration_service import OrchestrationService
from app.services.sandbox_service import SandboxService


def get_agent_service() -> AgentService:
    return AgentService()


def get_budget_service() -> BudgetService:
    return BudgetService()


def get_communication_service() -> CommunicationService:
    return CommunicationService()


def get_observability_service() -> ObservabilityService:
    return ObservabilityService()


def get_onboarding_service() -> OnboardingService:
    return OnboardingService()


def get_github_service() -> GitHubService:
    return GitHubService()


def get_memory_service() -> MemoryService:
    return MemoryService()


def get_sandbox_service() -> SandboxService:
    return SandboxService()


def get_orchestration_service() -> OrchestrationService:
    return OrchestrationService()
