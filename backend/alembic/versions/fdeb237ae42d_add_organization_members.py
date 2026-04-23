"""add organization_members

Revision ID: fdeb237ae42d
Revises: 77145e838bb5
Create Date: 2026-04-22 21:34:09.383324
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'fdeb237ae42d'
down_revision: Union[str, None] = '77145e838bb5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="member"),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "organization_id",
                            name="uq_organization_members_user_org"),
    )
    op.create_index(
        "ix_organization_members_user_id",
        "organization_members",
        ["user_id"],
    )
    op.create_index(
        "ix_organization_members_organization_id",
        "organization_members",
        ["organization_id"],
    )

    # Backfill one membership row per (user.id, user.organization_id) that
    # already exists — every legacy user keeps access to their auto-provisioned org.
    op.execute(
        """
        INSERT INTO organization_members (id, user_id, organization_id, role, joined_at)
        SELECT
            gen_random_uuid(),
            u.id,
            u.organization_id,
            CASE WHEN u.role IN ('owner', 'admin') THEN u.role ELSE 'member' END,
            COALESCE(u.created_at, NOW())
        FROM users u
        WHERE u.organization_id IS NOT NULL
        ON CONFLICT (user_id, organization_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_organization_members_organization_id", table_name="organization_members")
    op.drop_index("ix_organization_members_user_id", table_name="organization_members")
    op.drop_table("organization_members")
