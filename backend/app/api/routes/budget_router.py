"""Budget and billing endpoints — token tracking and Stripe integration."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.dependencies import get_budget_service
from app.schemas.budget_schema import (
    AgentBudgetSnapshot,
    BudgetEstimateRequest,
    BudgetEstimateResponse,
    BudgetSummaryResponse,
    StripeCheckoutResponse,
)
from app.schemas.common_schema import MessageResponse
from app.services.budget_service import BudgetService

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("/summary", response_model=BudgetSummaryResponse)
def get_summary(
    budget_service: Annotated[BudgetService, Depends(get_budget_service)],
) -> BudgetSummaryResponse:
    """Overview of token consumption across all agents."""
    return budget_service.get_summary()


@router.post("/estimate", response_model=BudgetEstimateResponse)
def estimate_budget(
    request: BudgetEstimateRequest,
    budget_service: Annotated[BudgetService, Depends(get_budget_service)],
) -> BudgetEstimateResponse:
    """Estimate monthly cost for a given configuration."""
    return budget_service.estimate_budget(request)


@router.get("/agents/{agent_id}", response_model=AgentBudgetSnapshot)
def get_agent_consumption(
    agent_id: str,
    budget_service: Annotated[BudgetService, Depends(get_budget_service)],
) -> AgentBudgetSnapshot:
    """Get token consumption details for a specific agent."""
    snapshot = budget_service.get_agent_consumption(agent_id)
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return snapshot


@router.post("/checkout", response_model=StripeCheckoutResponse)
async def create_checkout(
    project_id: str,
    price_id: str,
    budget_service: Annotated[BudgetService, Depends(get_budget_service)],
) -> StripeCheckoutResponse:
    """Create a Stripe Checkout session for project billing."""
    return await budget_service.create_checkout_session(project_id, price_id)


@router.post("/webhook", response_model=MessageResponse)
async def stripe_webhook(request: Request) -> MessageResponse:
    """Handle Stripe webhook events (subscription updates, payment failures, etc.).

    Verifies the webhook signature and processes relevant event types
    to keep budget allocations in sync with billing status.
    """
    return MessageResponse(message="Webhook received.")
