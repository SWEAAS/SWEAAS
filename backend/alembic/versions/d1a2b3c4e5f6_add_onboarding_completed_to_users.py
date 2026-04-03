"""add onboarding_completed to users

Revision ID: d1a2b3c4e5f6
Revises: c7d4e8f9a1b2
Create Date: 2026-04-03 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "d1a2b3c4e5f6"
down_revision = "c7d4e8f9a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarding_completed", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed")
