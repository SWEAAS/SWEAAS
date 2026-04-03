"""add stripe connect tables

Revision ID: b5e9d3f7a2c4
Revises: a3f8c2d4e6b1
Create Date: 2026-04-03 18:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "b5e9d3f7a2c4"
down_revision: Union[str, None] = "a3f8c2d4e6b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "connected_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organizations.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("stripe_account_id", sa.String(255), unique=True, nullable=False),
        sa.Column("onboarding_complete", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("charges_enabled", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("payouts_enabled", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "payment_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "connected_account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("connected_accounts.id"),
            nullable=False,
        ),
        sa.Column("stripe_payment_intent_id", sa.String(255), unique=True, nullable=False),
        sa.Column("stripe_checkout_session_id", sa.String(255), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("platform_fee_cents", sa.Integer(), nullable=False),
        sa.Column("net_amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(10), server_default="usd"),
        sa.Column("status", sa.String(50), server_default="succeeded"),
        sa.Column("end_user_email", sa.String(320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "payout_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "connected_account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("connected_accounts.id"),
            nullable=False,
        ),
        sa.Column("stripe_payout_id", sa.String(255), unique=True, nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(10), server_default="usd"),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("arrival_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("payout_records")
    op.drop_table("payment_records")
    op.drop_table("connected_accounts")
