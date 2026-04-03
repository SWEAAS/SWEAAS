"""Agent ORM models — config, sessions, and persistent memory."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AgentConfig(Base):
    __tablename__ = "agent_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    hierarchy_level: Mapped[str] = mapped_column(
        String(50), default="specialist"
    )
    parent_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_configs.id"), nullable=True
    )
    system_prompt_path: Mapped[str] = mapped_column(String(500), default="")
    daily_token_budget: Mapped[int] = mapped_column(Integer, default=100_000)
    tokens_used_today: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    strike_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(50), default="active")
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    current_focus: Mapped[str] = mapped_column(String(500), default="", server_default="")
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    pronouns: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    replica_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    poster_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    thumbnail_video_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="agents")  # noqa: F821
    parent: Mapped["AgentConfig | None"] = relationship(remote_side=[id])
    sessions: Mapped[list["AgentSession"]] = relationship(back_populates="agent")
    usage_logs: Mapped[list["TokenUsageLog"]] = relationship(back_populates="agent")  # noqa: F821


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_configs.id"), nullable=False
    )
    sandbox_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")  # running | paused | done
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agent: Mapped[AgentConfig] = relationship(back_populates="sessions")


class AgentMemory(Base):
    """Structured memory entries persisted to the database alongside ChromaDB embeddings."""

    __tablename__ = "agent_memories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_configs.id"), nullable=False
    )
    # decision | lesson | context
    memory_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
