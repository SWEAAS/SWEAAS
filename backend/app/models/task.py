"""Task and Report ORM models."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    assigned_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_configs.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    # queued | running | completed | blocked | failed
    status: Mapped[str] = mapped_column(String(50), default="queued")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    result_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="tasks")  # noqa: F821


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    report_type: Mapped[str] = mapped_column(String(50), default="daily")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
