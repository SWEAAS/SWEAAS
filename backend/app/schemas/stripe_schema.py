"""Schemas for Stripe Connect endpoints — onboarding, checkout, revenue, payouts."""

from pydantic import BaseModel, Field


class ConnectOnboardResponse(BaseModel):
    account_link_url: str


class ConnectStatusResponse(BaseModel):
    stripe_account_id: str | None = None
    onboarding_complete: bool = False
    charges_enabled: bool = False
    payouts_enabled: bool = False


class CheckoutRequest(BaseModel):
    project_id: str
    price_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class RevenueSummaryResponse(BaseModel):
    total_revenue_cents: int = 0
    total_fees_cents: int = 0
    net_earnings_cents: int = 0
    payment_count: int = 0
    currency: str = "usd"


class RevenueBreakdownItem(BaseModel):
    month: str
    revenue_cents: int = 0
    fees_cents: int = 0
    net_cents: int = 0
    payment_count: int = 0


class RevenueBreakdownResponse(BaseModel):
    months: list[RevenueBreakdownItem] = Field(default_factory=list)
    currency: str = "usd"


class BalanceResponse(BaseModel):
    available_cents: int = 0
    pending_cents: int = 0
    currency: str = "usd"


class PayoutItem(BaseModel):
    id: str
    stripe_payout_id: str
    amount_cents: int
    currency: str = "usd"
    status: str
    arrival_date: str | None = None
    created_at: str


class PayoutListResponse(BaseModel):
    payouts: list[PayoutItem] = Field(default_factory=list)


class PaymentItem(BaseModel):
    id: str
    project_id: str
    stripe_payment_intent_id: str
    amount_cents: int
    platform_fee_cents: int
    net_amount_cents: int
    currency: str = "usd"
    status: str
    end_user_email: str | None = None
    created_at: str


class PaymentListResponse(BaseModel):
    payments: list[PaymentItem] = Field(default_factory=list)
    total_count: int = 0
