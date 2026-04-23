"""add public_token to projects

Revision ID: 77145e838bb5
Revises: e2f3a4b5c6d7
Create Date: 2026-04-22 19:55:12.340619
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '77145e838bb5'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so existing rows survive; backfill random tokens; then
    # enforce not-null + unique. Matches the model's secrets.token_urlsafe(32).
    op.add_column(
        "projects",
        sa.Column("public_token", sa.String(length=64), nullable=True),
    )
    # Backfill any existing rows with a unique random 43-char token.
    # Uses only built-in pg functions (no pgcrypto dependency).
    op.execute(
        "UPDATE projects "
        "SET public_token = md5(random()::text || clock_timestamp()::text) "
        "       || md5(random()::text || clock_timestamp()::text) "
        "WHERE public_token IS NULL"
    )
    op.alter_column("projects", "public_token", nullable=False)
    op.create_index(
        "ix_projects_public_token",
        "projects",
        ["public_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_projects_public_token", table_name="projects")
    op.drop_column("projects", "public_token")
