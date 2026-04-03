"""Top-level API router — aggregates all route modules.

Integration guide:
  1. Create a new router in app/api/routes/<domain>_router.py
  2. Import and include it below with appropriate prefix/tags
  3. Add corresponding service in app/services/
  4. Register the service factory in app/core/dependencies.py
"""

from fastapi import APIRouter

from app.api.routes.agent_router import router as agent_router
from app.api.routes.auth_router import router as auth_router
from app.api.routes.budget_router import router as budget_router
from app.api.routes.communication_router import router as communication_router
from app.api.routes.feedback_router import router as feedback_router
from app.api.routes.github_router import router as github_router
from app.api.routes.health_router import router as health_router
from app.api.routes.notification_router import router as notification_router
from app.api.routes.observability_router import router as observability_router
from app.api.routes.onboarding_router import router as onboarding_router
from app.api.routes.orchestration_router import router as orchestration_router
from app.api.routes.project_router import router as project_router
from app.api.routes.stripe_connect_router import router as stripe_connect_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(project_router)
api_router.include_router(agent_router)
api_router.include_router(budget_router)
api_router.include_router(onboarding_router)
api_router.include_router(communication_router)
api_router.include_router(notification_router)
api_router.include_router(feedback_router)
api_router.include_router(github_router)
api_router.include_router(observability_router)
api_router.include_router(orchestration_router)
api_router.include_router(stripe_connect_router)
