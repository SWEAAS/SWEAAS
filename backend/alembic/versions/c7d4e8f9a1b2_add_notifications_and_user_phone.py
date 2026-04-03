"""add notifications tables and user phone_number

Revision ID: c7d4e8f9a1b2
Revises: b5e9d3f7a2c4
Create Date: 2026-04-03 20:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "c7d4e8f9a1b2"
down_revision: Union[str, None] = "b5e9d3f7a2c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_number", sa.String(20), nullable=True))

    op.create_table(
        "notification_preferences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("email_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sms_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("in_app_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("report_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("budget_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("action_required_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("feedback_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("agent_status_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("security_notifications", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("budget_threshold_percent", sa.Float(), server_default=sa.text("85.0"), nullable=False),
        sa.Column("budget_threshold_amount_usd", sa.Float(), nullable=True),
        sa.Column("digest_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("digest_frequency", sa.String(20), server_default="daily", nullable=False),
        sa.Column("quiet_hours_start", sa.Integer(), nullable=True),
        sa.Column("quiet_hours_end", sa.Integer(), nullable=True),
        sa.Column("timezone", sa.String(50), server_default="UTC", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", sa.String(50), nullable=False, index=True),
        sa.Column("priority", sa.String(20), server_default="medium", nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_url", sa.String(500), nullable=True),
        sa.Column("channel", sa.String(30), server_default="in_app", nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False, index=True),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sms_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("notification_preferences")
    op.drop_column("users", "phone_number")
