"""Budget and token tracking endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_budget_service
from app.schemas.budget_schema import (
    AgentBudgetSnapshot,
    BudgetEstimateRequest,
    BudgetEstimateResponse,
    BudgetSummaryResponse,
)
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("/summary", response_model=BudgetSummaryResponse)
def get_budget_summary(
    budget_service: BudgetService = Depends(get_budget_service),
) -> BudgetSummaryResponse:
    return budget_service.get_summary()


@router.post("/estimate", response_model=BudgetEstimateResponse)
def estimate_budget(
    request: BudgetEstimateRequest,
    budget_service: BudgetService = Depends(get_budget_service),
) -> BudgetEstimateResponse:
    return budget_service.estimate_budget(request)


@router.get("/agents/{agent_id}/consumption", response_model=AgentBudgetSnapshot)
def get_agent_consumption(
    agent_id: str,
    budget_service: BudgetService = Depends(get_budget_service),
) -> AgentBudgetSnapshot:
    snapshot = budget_service.get_agent_consumption(agent_id)
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return snapshot
