"""add last_execution_at to project_configs

Revision ID: a3f8c2d4e6b1
Revises: 90d7b9c1f9d1
Create Date: 2026-04-03 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f8c2d4e6b1"
down_revision: Union[str, None] = "90d7b9c1f9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project_configs",
        sa.Column("last_execution_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_configs", "last_execution_at")
