"""Replica catalog ORM model for Tavus personas."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ReplicaProfile(Base):
    __tablename__ = "replica_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    replica_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    replica_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    thumbnail_video_url: Mapped[str] = mapped_column(Text, default="")
    model_name: Mapped[str] = mapped_column(String(255), default="")
    poster_image_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    poster_image_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    poster_image_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    poster_svg: Mapped[str] = mapped_column(Text, nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
