"""extend agent_configs columns

Revision ID: e2f3a4b5c6d7
Revises: d1a2b3c4e5f6
Create Date: 2026-04-03 12:10:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "e2f3a4b5c6d7"
down_revision = "d1a2b3c4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_configs", sa.Column("tokens_used_today", sa.Integer(), server_default="0", nullable=False))
    op.add_column("agent_configs", sa.Column("strike_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("agent_configs", sa.Column("description", sa.Text(), server_default="", nullable=False))
    op.add_column("agent_configs", sa.Column("current_focus", sa.String(500), server_default="", nullable=False))
    op.add_column("agent_configs", sa.Column("email", sa.String(320), nullable=True))
    op.add_column("agent_configs", sa.Column("pronouns", sa.String(30), nullable=True))
    op.add_column("agent_configs", sa.Column("location", sa.String(200), nullable=True))
    op.add_column("agent_configs", sa.Column("timezone", sa.String(100), nullable=True))
    op.add_column("agent_configs", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("agent_configs", sa.Column("replica_id", sa.String(200), nullable=True))
    op.add_column("agent_configs", sa.Column("poster_image_url", sa.String(1000), nullable=True))
    op.add_column("agent_configs", sa.Column("thumbnail_video_url", sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_configs", "thumbnail_video_url")
    op.drop_column("agent_configs", "poster_image_url")
    op.drop_column("agent_configs", "replica_id")
    op.drop_column("agent_configs", "start_date")
    op.drop_column("agent_configs", "timezone")
    op.drop_column("agent_configs", "location")
    op.drop_column("agent_configs", "pronouns")
    op.drop_column("agent_configs", "email")
    op.drop_column("agent_configs", "current_focus")
    op.drop_column("agent_configs", "description")
    op.drop_column("agent_configs", "strike_count")
    op.drop_column("agent_configs", "tokens_used_today")
