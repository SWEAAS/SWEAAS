"""Top-level API router."""

from fastapi import APIRouter

from app.api.routes.agent_router import router as agent_router
from app.api.routes.budget_router import router as budget_router
from app.api.routes.communication_router import router as communication_router
from app.api.routes.health_router import router as health_router
from app.api.routes.observability_router import router as observability_router
from app.api.routes.onboarding_router import router as onboarding_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(agent_router)
api_router.include_router(budget_router)
api_router.include_router(onboarding_router)
api_router.include_router(communication_router)
api_router.include_router(observability_router)
