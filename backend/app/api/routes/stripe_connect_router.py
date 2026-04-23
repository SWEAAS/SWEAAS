"""Stripe Connect endpoints — onboarding, checkout, revenue, payouts, webhooks."""

import json
import logging
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.dependencies import get_stripe_connect_service
from app.core.user_provisioning import ensure_db_user, ensure_org_id
from app.models.stripe import ConnectedAccount
from app.models.user import User
from app.schemas.common_schema import MessageResponse
from app.schemas.stripe_schema import (
    BalanceResponse,
    CheckoutRequest,
    CheckoutResponse,
    ConnectOnboardResponse,
    ConnectStatusResponse,
    PaymentListResponse,
    PayoutListResponse,
    RevenueBreakdownResponse,
    RevenueSummaryResponse,
)
from app.services.stripe_connect_service import StripeConnectService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stripe", tags=["stripe"])


async def _resolve_org_id(user: AuthenticatedUser, db: AsyncSession):
    """Return the caller's org UUID, auto-provisioning on first authenticated hit."""
    return await ensure_org_id(db, user)


async def _resolve_user_email(user: AuthenticatedUser, db: AsyncSession) -> str:
    db_user = await ensure_db_user(db, user)
    return db_user.email or ""


# ── Connect onboarding ──────────────────────────────────────────

@router.post("/connect/onboard", response_model=ConnectOnboardResponse)
async def onboard_connect(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConnectOnboardResponse:
    """Start or resume Stripe Connect onboarding for the authenticated user's org."""
    org_id = await _resolve_org_id(user, db)
    email = await _resolve_user_email(user, db)
    return await svc.create_connected_account(org_id, email, db)


@router.get("/connect/status", response_model=ConnectStatusResponse)
async def connect_status(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConnectStatusResponse:
    """Return Connect onboarding status for the authenticated user's org."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_onboarding_status(org_id, db)


@router.post("/connect/account-link", response_model=ConnectOnboardResponse)
async def refresh_account_link(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConnectOnboardResponse:
    """Regenerate an Account Link if the previous one expired."""
    org_id = await _resolve_org_id(user, db)
    try:
        return await svc.create_account_link(org_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


# ── Checkout ────────────────────────────────────────────────────

@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CheckoutResponse:
    """Create a Stripe Checkout Session with destination charges."""
    org_id = await _resolve_org_id(user, db)

    result = await db.execute(
        select(ConnectedAccount).where(ConnectedAccount.organization_id == org_id)
    )
    acct = result.scalar_one_or_none()
    if acct is None or not acct.charges_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stripe Connect onboarding must be completed before accepting payments.",
        )

    return await svc.create_checkout_session(
        project_id=body.project_id,
        price_id=body.price_id,
        connected_account_id=acct.id,
        stripe_account_id=acct.stripe_account_id,
        db=db,
    )


# ── Revenue ─────────────────────────────────────────────────────

@router.get("/revenue", response_model=RevenueSummaryResponse)
async def get_revenue(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: str | None = Query(default=None),
) -> RevenueSummaryResponse:
    """Revenue summary for the authenticated user's org."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_revenue_summary(org_id, db, project_id=project_id)


@router.get("/revenue/breakdown", response_model=RevenueBreakdownResponse)
async def get_revenue_breakdown(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: str | None = Query(default=None),
) -> RevenueBreakdownResponse:
    """Monthly revenue breakdown."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_revenue_breakdown(org_id, db, project_id=project_id)


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PaymentListResponse:
    """Paginated list of payments."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_payments(org_id, db, project_id=project_id, limit=limit, offset=offset)


# ── Balance ─────────────────────────────────────────────────────

@router.get("/balance", response_model=BalanceResponse)
async def get_balance(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BalanceResponse:
    """Current Stripe balance for the connected account."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_balance(org_id, db)


# ── Payouts ─────────────────────────────────────────────────────

@router.get("/payouts", response_model=PayoutListResponse)
async def list_payouts(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PayoutListResponse:
    """Payout history for the connected account."""
    org_id = await _resolve_org_id(user, db)
    return await svc.get_payout_history(org_id, db)


# ── Webhook ─────────────────────────────────────────────────────

def _webhook_secret_configured(secret: str) -> bool:
    s = (secret or "").strip()
    return bool(s) and "your-webhook" not in s.lower()


@router.post("/webhook", response_model=MessageResponse)
async def stripe_webhook(
    request: Request,
    svc: Annotated[StripeConnectService, Depends(get_stripe_connect_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    """Unified Stripe webhook — verifies signature, routes to handlers."""
    settings = get_settings()
    body = await request.body()
    sig = request.headers.get("stripe-signature")

    if not _webhook_secret_configured(settings.stripe_webhook_secret):
        logger.warning(
            "Stripe webhook received but STRIPE_WEBHOOK_SECRET is unset or placeholder; "
            "skipping signature verification (dev only)."
        )
        try:
            event = json.loads(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload.")
        msg = await svc.handle_webhook_event(event, db)
        await db.commit()
        return MessageResponse(message=msg)

    if not sig:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header.",
        )

    try:
        event = stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload.") from exc
    except stripe.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature.") from exc

    msg = await svc.handle_webhook_event(event, db)
    await db.commit()
    return MessageResponse(message=msg)
