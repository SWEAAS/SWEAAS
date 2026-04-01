"""Budget and billing endpoints — token tracking and Stripe integration."""

import logging
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.config import get_settings
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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/budget", tags=["budget"])


def _stripe_webhook_secret_configured(secret: str) -> bool:
    s = (secret or "").strip()
    return bool(s) and "your-webhook" not in s.lower()


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
async def stripe_webhook(
    request: Request,
    budget_service: Annotated[BudgetService, Depends(get_budget_service)],
) -> MessageResponse:
    """Verify Stripe signature (when ``STRIPE_WEBHOOK_SECRET`` is set), then handle events."""
    settings = get_settings()
    body = await request.body()
    sig = request.headers.get("stripe-signature")

    if not _stripe_webhook_secret_configured(settings.stripe_webhook_secret):
        logger.warning(
            "Stripe webhook received but STRIPE_WEBHOOK_SECRET is unset or placeholder; "
            "skipping signature verification (dev only)."
        )
        return MessageResponse(message="Webhook received (signature not verified).")

    if not sig:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header.",
        )

    try:
        event = stripe.Webhook.construct_event(
            body,
            sig,
            settings.stripe_webhook_secret,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload.",
        ) from exc
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Stripe signature.",
        ) from exc

    msg = budget_service.handle_stripe_webhook_event(event)
    return MessageResponse(message=msg)
