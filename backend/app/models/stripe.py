"""Stripe Connect ORM models — connected accounts, payments, and payouts."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ConnectedAccount(Base):
    """Links an Organization to a Stripe Connect account."""

    __tablename__ = "connected_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), unique=True, nullable=False
    )
    stripe_account_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    charges_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    payouts_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped["Organization"] = relationship()  # noqa: F821
    payments: Mapped[list["PaymentRecord"]] = relationship(back_populates="connected_account")
    payouts: Mapped[list["PayoutRecord"]] = relationship(back_populates="connected_account")


class PaymentRecord(Base):
    """Individual payment ledger entry for revenue tracking."""

    __tablename__ = "payment_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    connected_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id"), nullable=False
    )
    stripe_payment_intent_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    stripe_checkout_session_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    platform_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    net_amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="usd")
    status: Mapped[str] = mapped_column(String(50), default="succeeded")
    end_user_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    connected_account: Mapped[ConnectedAccount] = relationship(back_populates="payments")
    project: Mapped["Project"] = relationship()  # noqa: F821


class PayoutRecord(Base):
    """Tracks Stripe payouts to connected accounts."""

    __tablename__ = "payout_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connected_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connected_accounts.id"), nullable=False
    )
    stripe_payout_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="usd")
    status: Mapped[str] = mapped_column(String(50), default="pending")
    arrival_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    connected_account: Mapped[ConnectedAccount] = relationship(back_populates="payouts")
