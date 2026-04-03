"""add replica_profiles table

Revision ID: 90d7b9c1f9d1
Revises: 145eceded9f5
Create Date: 2026-04-02 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "90d7b9c1f9d1"
down_revision: Union[str, None] = "145eceded9f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "replica_profiles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("replica_id", sa.String(length=255), nullable=False),
        sa.Column("replica_name", sa.String(length=255), nullable=False),
        sa.Column("normalized_name", sa.String(length=255), nullable=False),
        sa.Column("thumbnail_video_url", sa.Text(), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("poster_image_bytes", sa.LargeBinary(), nullable=True),
        sa.Column("poster_image_content_type", sa.String(length=100), nullable=True),
        sa.Column("poster_image_hash", sa.String(length=64), nullable=False),
        sa.Column("poster_svg", sa.Text(), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("replica_id"),
    )
    op.create_index(op.f("ix_replica_profiles_normalized_name"), "replica_profiles", ["normalized_name"], unique=False)
    op.create_index(op.f("ix_replica_profiles_replica_id"), "replica_profiles", ["replica_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_replica_profiles_replica_id"), table_name="replica_profiles")
    op.drop_index(op.f("ix_replica_profiles_normalized_name"), table_name="replica_profiles")
    op.drop_table("replica_profiles")
