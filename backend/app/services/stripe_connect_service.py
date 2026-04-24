"""Stripe Connect service — account onboarding, destination charges, revenue tracking, payouts."""

import logging
import math
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import stripe
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.stripe import ConnectedAccount, PaymentRecord, PayoutRecord
from app.schemas.stripe_schema import (
    BalanceResponse,
    CheckoutResponse,
    ConnectOnboardResponse,
    ConnectStatusResponse,
    PaymentItem,
    PaymentListResponse,
    PayoutItem,
    PayoutListResponse,
    RevenueBreakdownItem,
    RevenueBreakdownResponse,
    RevenueSummaryResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _configure_stripe() -> None:
    stripe.api_key = settings.stripe_secret_key


class StripeConnectService:
    """Encapsulates all Stripe Connect platform logic."""

    # ── Connect onboarding ──────────────────────────────────────

    async def create_connected_account(
        self, org_id: UUID, email: str, db: AsyncSession
    ) -> ConnectOnboardResponse:
        """Create a Standard Connect account and return an Account Link URL."""
        _configure_stripe()

        existing = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.organization_id == org_id)
        )
        acct_row = existing.scalar_one_or_none()

        if acct_row is not None:
            link = stripe.AccountLink.create(
                account=acct_row.stripe_account_id,
                refresh_url=settings.stripe_connect_refresh_url,
                return_url=settings.stripe_connect_return_url,
                type="account_onboarding",
            )
            return ConnectOnboardResponse(account_link_url=link.url)

        account = stripe.Account.create(
            type="standard",
            email=email,
            metadata={"sweaas_org_id": str(org_id)},
        )

        acct_row = ConnectedAccount(
            organization_id=org_id,
            stripe_account_id=account.id,
        )
        db.add(acct_row)
        await db.flush()

        link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=settings.stripe_connect_refresh_url,
            return_url=settings.stripe_connect_return_url,
            type="account_onboarding",
        )
        return ConnectOnboardResponse(account_link_url=link.url)

    async def create_account_link(
        self, org_id: UUID, db: AsyncSession
    ) -> ConnectOnboardResponse:
        """Regenerate an Account Link (e.g. if the previous one expired)."""
        _configure_stripe()

        result = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.organization_id == org_id)
        )
        acct_row = result.scalar_one_or_none()
        if acct_row is None:
            raise ValueError("No connected account found for this organization.")

        link = stripe.AccountLink.create(
            account=acct_row.stripe_account_id,
            refresh_url=settings.stripe_connect_refresh_url,
            return_url=settings.stripe_connect_return_url,
            type="account_onboarding",
        )
        return ConnectOnboardResponse(account_link_url=link.url)

    async def get_onboarding_status(
        self, org_id: UUID, db: AsyncSession
    ) -> ConnectStatusResponse:
        """Return the current Connect onboarding status for an organization."""
        result = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.organization_id == org_id)
        )
        acct_row = result.scalar_one_or_none()
        if acct_row is None:
            return ConnectStatusResponse()

        return ConnectStatusResponse(
            stripe_account_id=acct_row.stripe_account_id,
            onboarding_complete=acct_row.onboarding_complete,
            charges_enabled=acct_row.charges_enabled,
            payouts_enabled=acct_row.payouts_enabled,
        )

    async def handle_account_updated(
        self, event: dict[str, Any], db: AsyncSession
    ) -> None:
        """Process `account.updated` webhook to sync onboarding state."""
        acct_obj = (event.get("data") or {}).get("object") or {}
        acct_id = acct_obj.get("id")
        if not acct_id:
            return

        result = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.stripe_account_id == acct_id)
        )
        acct_row = result.scalar_one_or_none()
        if acct_row is None:
            logger.warning("account.updated for unknown account %s", acct_id)
            return

        acct_row.charges_enabled = acct_obj.get("charges_enabled", False)
        acct_row.payouts_enabled = acct_obj.get("payouts_enabled", False)
        details_submitted = acct_obj.get("details_submitted", False)
        acct_row.onboarding_complete = details_submitted and acct_row.charges_enabled
        await db.flush()
        logger.info(
            "Connected account %s updated: charges=%s payouts=%s onboarded=%s",
            acct_id,
            acct_row.charges_enabled,
            acct_row.payouts_enabled,
            acct_row.onboarding_complete,
        )

    # ── Checkout with destination charges ───────────────────────

    async def create_checkout_session(
        self,
        project_id: str,
        price_id: str,
        connected_account_id: UUID,
        stripe_account_id: str,
        db: AsyncSession,
    ) -> CheckoutResponse:
        """Create a Stripe Checkout Session with destination charges.

        Retrieves the Price to calculate the platform fee (application_fee_amount)
        so SWEAAS retains its cut and the rest transfers to the connected account.
        """
        _configure_stripe()

        fee_pct = settings.stripe_platform_fee_percent / 100.0

        price = stripe.Price.retrieve(price_id)
        unit_amount = price.unit_amount or 0
        application_fee = math.ceil(unit_amount * fee_pct)

        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": price_id, "quantity": 1}],
            payment_intent_data={
                "application_fee_amount": application_fee,
                "transfer_data": {"destination": stripe_account_id},
                "metadata": {
                    "project_id": project_id,
                    "connected_account_id": str(connected_account_id),
                    "fee_percent": str(settings.stripe_platform_fee_percent),
                },
            },
            metadata={
                "project_id": project_id,
                "connected_account_id": str(connected_account_id),
            },
            success_url=(
                settings.stripe_connect_return_url.split("?")[0]
                + "?stripe=checkout_success&session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=(
                settings.stripe_connect_return_url.split("?")[0]
                + "?stripe=checkout_cancel"
            ),
        )
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)

    async def handle_checkout_completed(
        self, event: dict[str, Any], db: AsyncSession
    ) -> None:
        """Process `checkout.session.completed` — record the payment."""
        session_obj = (event.get("data") or {}).get("object") or {}
        meta = session_obj.get("metadata") or {}
        project_id = meta.get("project_id")
        connected_account_id = meta.get("connected_account_id")

        if not project_id or not connected_account_id:
            logger.info("checkout.session.completed without project/account metadata, skipping")
            return

        payment_intent_id = session_obj.get("payment_intent")
        if not payment_intent_id:
            return

        existing = await db.execute(
            select(PaymentRecord).where(
                PaymentRecord.stripe_payment_intent_id == payment_intent_id
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        _configure_stripe()
        pi = stripe.PaymentIntent.retrieve(
            payment_intent_id, expand=["latest_charge.application_fee"]
        )
        amount = getattr(pi, "amount", 0) or 0

        fee_amount = 0
        latest_charge = getattr(pi, "latest_charge", None)
        if latest_charge is not None:
            if isinstance(latest_charge, dict):
                app_fee = latest_charge.get("application_fee")
            else:
                app_fee = getattr(latest_charge, "application_fee", None)
            if app_fee is not None:
                if isinstance(app_fee, dict):
                    fee_amount = app_fee.get("amount", 0) or 0
                else:
                    fee_amount = getattr(app_fee, "amount", 0) or 0

        net = amount - fee_amount

        record = PaymentRecord(
            project_id=project_id,
            connected_account_id=connected_account_id,
            stripe_payment_intent_id=payment_intent_id,
            stripe_checkout_session_id=session_obj.get("id"),
            amount_cents=amount,
            platform_fee_cents=fee_amount,
            net_amount_cents=net,
            currency=(pi.currency or "usd").lower(),
            status="succeeded",
            end_user_email=session_obj.get("customer_details", {}).get("email"),
        )
        db.add(record)
        await db.flush()
        logger.info(
            "Payment recorded: pi=%s amount=%d fee=%d net=%d project=%s",
            payment_intent_id,
            amount,
            fee_amount,
            net,
            project_id,
        )

    async def handle_payment_intent_succeeded(
        self, event: dict[str, Any], db: AsyncSession
    ) -> None:
        """Update payment status on `payment_intent.succeeded`."""
        pi_obj = (event.get("data") or {}).get("object") or {}
        pi_id = pi_obj.get("id")
        if not pi_id:
            return

        result = await db.execute(
            select(PaymentRecord).where(PaymentRecord.stripe_payment_intent_id == pi_id)
        )
        record = result.scalar_one_or_none()
        if record is not None:
            record.status = "succeeded"
            await db.flush()

    # ── Revenue queries ─────────────────────────────────────────

    async def get_revenue_summary(
        self, org_id: UUID, db: AsyncSession, project_id: str | None = None
    ) -> RevenueSummaryResponse:
        """Aggregate revenue for an organization, optionally filtered by project."""
        acct_result = await db.execute(
            select(ConnectedAccount.id).where(ConnectedAccount.organization_id == org_id)
        )
        acct_id = acct_result.scalar_one_or_none()
        if acct_id is None:
            return RevenueSummaryResponse()

        query = select(
            func.coalesce(func.sum(PaymentRecord.amount_cents), 0).label("total_revenue"),
            func.coalesce(func.sum(PaymentRecord.platform_fee_cents), 0).label("total_fees"),
            func.coalesce(func.sum(PaymentRecord.net_amount_cents), 0).label("net_earnings"),
            func.count(PaymentRecord.id).label("payment_count"),
        ).where(
            PaymentRecord.connected_account_id == acct_id,
            PaymentRecord.status == "succeeded",
        )

        if project_id:
            query = query.where(PaymentRecord.project_id == project_id)

        row = (await db.execute(query)).one()
        return RevenueSummaryResponse(
            total_revenue_cents=row.total_revenue,
            total_fees_cents=row.total_fees,
            net_earnings_cents=row.net_earnings,
            payment_count=row.payment_count,
        )

    async def get_revenue_breakdown(
        self, org_id: UUID, db: AsyncSession, project_id: str | None = None
    ) -> RevenueBreakdownResponse:
        """Monthly revenue breakdown for the organization."""
        acct_result = await db.execute(
            select(ConnectedAccount.id).where(ConnectedAccount.organization_id == org_id)
        )
        acct_id = acct_result.scalar_one_or_none()
        if acct_id is None:
            return RevenueBreakdownResponse()

        year_col = extract("year", PaymentRecord.created_at).label("yr")
        month_col = extract("month", PaymentRecord.created_at).label("mo")

        query = (
            select(
                year_col,
                month_col,
                func.coalesce(func.sum(PaymentRecord.amount_cents), 0).label("revenue"),
                func.coalesce(func.sum(PaymentRecord.platform_fee_cents), 0).label("fees"),
                func.coalesce(func.sum(PaymentRecord.net_amount_cents), 0).label("net"),
                func.count(PaymentRecord.id).label("cnt"),
            )
            .where(
                PaymentRecord.connected_account_id == acct_id,
                PaymentRecord.status == "succeeded",
            )
            .group_by(year_col, month_col)
            .order_by(year_col, month_col)
        )

        if project_id:
            query = query.where(PaymentRecord.project_id == project_id)

        rows = (await db.execute(query)).all()
        items = [
            RevenueBreakdownItem(
                month=f"{int(r.yr)}-{int(r.mo):02d}",
                revenue_cents=r.revenue,
                fees_cents=r.fees,
                net_cents=r.net,
                payment_count=r.cnt,
            )
            for r in rows
        ]
        return RevenueBreakdownResponse(months=items)

    async def get_payments(
        self,
        org_id: UUID,
        db: AsyncSession,
        project_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> PaymentListResponse:
        """Paginated list of payments for the organization."""
        acct_result = await db.execute(
            select(ConnectedAccount.id).where(ConnectedAccount.organization_id == org_id)
        )
        acct_id = acct_result.scalar_one_or_none()
        if acct_id is None:
            return PaymentListResponse()

        base = select(PaymentRecord).where(PaymentRecord.connected_account_id == acct_id)
        if project_id:
            base = base.where(PaymentRecord.project_id == project_id)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await db.execute(count_q)).scalar() or 0

        query = base.order_by(PaymentRecord.created_at.desc()).limit(limit).offset(offset)
        rows = (await db.execute(query)).scalars().all()

        items = [
            PaymentItem(
                id=str(r.id),
                project_id=str(r.project_id),
                stripe_payment_intent_id=r.stripe_payment_intent_id,
                amount_cents=r.amount_cents,
                platform_fee_cents=r.platform_fee_cents,
                net_amount_cents=r.net_amount_cents,
                currency=r.currency,
                status=r.status,
                end_user_email=r.end_user_email,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
            for r in rows
        ]
        return PaymentListResponse(payments=items, total_count=total)

    # ── Balance ─────────────────────────────────────────────────

    async def get_balance(
        self, org_id: UUID, db: AsyncSession
    ) -> BalanceResponse:
        """Retrieve the Stripe balance for the connected account."""
        result = await db.execute(
            select(ConnectedAccount).where(ConnectedAccount.organization_id == org_id)
        )
        acct_row = result.scalar_one_or_none()
        if acct_row is None or not acct_row.charges_enabled:
            return BalanceResponse()

        _configure_stripe()
        try:
            balance = stripe.Balance.retrieve(stripe_account=acct_row.stripe_account_id)
        except stripe.StripeError as exc:
            logger.warning("Failed to retrieve balance for %s: %s", acct_row.stripe_account_id, exc)
            return BalanceResponse()

        available_list = getattr(balance, "available", None) or []
        pending_list = getattr(balance, "pending", None) or []
        available = sum(getattr(b, "amount", 0) for b in available_list)
        pending = sum(getattr(b, "amount", 0) for b in pending_list)
        currency = "usd"
        if available_list:
            currency = getattr(available_list[0], "currency", "usd")

        return BalanceResponse(
            available_cents=available,
            pending_cents=pending,
            currency=currency,
        )

    # ── Payouts ─────────────────────────────────────────────────

    async def get_payout_history(
        self, org_id: UUID, db: AsyncSession
    ) -> PayoutListResponse:
        """List payout records for the organization's connected account."""
        acct_result = await db.execute(
            select(ConnectedAccount.id).where(ConnectedAccount.organization_id == org_id)
        )
        acct_id = acct_result.scalar_one_or_none()
        if acct_id is None:
            return PayoutListResponse()

        query = (
            select(PayoutRecord)
            .where(PayoutRecord.connected_account_id == acct_id)
            .order_by(PayoutRecord.created_at.desc())
            .limit(100)
        )
        rows = (await db.execute(query)).scalars().all()

        items = [
            PayoutItem(
                id=str(r.id),
                stripe_payout_id=r.stripe_payout_id,
                amount_cents=r.amount_cents,
                currency=r.currency,
                status=r.status,
                arrival_date=r.arrival_date.isoformat() if r.arrival_date else None,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
            for r in rows
        ]
        return PayoutListResponse(payouts=items)

    async def handle_payout_event(
        self, event: dict[str, Any], db: AsyncSession
    ) -> None:
        """Process payout.paid / payout.failed / payout.canceled events."""
        payout_obj = (event.get("data") or {}).get("object") or {}
        payout_id = payout_obj.get("id")
        if not payout_id:
            return

        stripe_account = event.get("account")
        if not stripe_account:
            return

        acct_result = await db.execute(
            select(ConnectedAccount).where(
                ConnectedAccount.stripe_account_id == stripe_account
            )
        )
        acct_row = acct_result.scalar_one_or_none()
        if acct_row is None:
            logger.warning("Payout event for unknown account %s", stripe_account)
            return

        existing = await db.execute(
            select(PayoutRecord).where(PayoutRecord.stripe_payout_id == payout_id)
        )
        record = existing.scalar_one_or_none()

        status = payout_obj.get("status", "pending")
        arrival_ts = payout_obj.get("arrival_date")
        arrival_dt = (
            datetime.fromtimestamp(arrival_ts, tz=timezone.utc) if arrival_ts else None
        )

        if record is not None:
            record.status = status
            if arrival_dt:
                record.arrival_date = arrival_dt
        else:
            record = PayoutRecord(
                connected_account_id=acct_row.id,
                stripe_payout_id=payout_id,
                amount_cents=payout_obj.get("amount", 0),
                currency=(payout_obj.get("currency") or "usd").lower(),
                status=status,
                arrival_date=arrival_dt,
            )
            db.add(record)

        await db.flush()
        logger.info("Payout %s status=%s for account %s", payout_id, status, stripe_account)

    # ── Webhook dispatcher ──────────────────────────────────────

    async def handle_webhook_event(
        self, event: dict[str, Any], db: AsyncSession
    ) -> str:
        """Route a verified Stripe webhook event to the correct handler."""
        etype = event.get("type", "")
        logger.info("Stripe webhook: type=%s id=%s", etype, event.get("id"))

        if etype == "account.updated":
            await self.handle_account_updated(event, db)
        elif etype == "checkout.session.completed":
            await self.handle_checkout_completed(event, db)
        elif etype == "payment_intent.succeeded":
            await self.handle_payment_intent_succeeded(event, db)
        elif etype in ("payout.paid", "payout.failed", "payout.canceled"):
            await self.handle_payout_event(event, db)
        elif etype in ("invoice.paid", "invoice.payment_failed"):
            logger.info("Invoice event %s — logged, no action", etype)
        else:
            logger.debug("Unhandled Stripe event type: %s", etype)

        return f"ok:{etype}"
