"""User feedback ingestion, routing to agents, and optional webhook fan-out.

Feedback is stored in-process for the API scaffold; production should persist
to PostgreSQL and enqueue tasks for the Product / Engineering agents.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.feedback_schema import (
    FeedbackItemResponse,
    FeedbackSubmitRequest,
    FeedbackWebhookPayload,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# In-memory store (replace with DB in production)
_FEEDBACK_STORE: list[dict[str, Any]] = []


class FeedbackService:
    """Collects product feedback, triages it, and optionally notifies external systems."""

    def submit(self, request: FeedbackSubmitRequest) -> FeedbackItemResponse:
        """Record feedback and optionally POST to FEEDBACK_WEBHOOK_URL."""
        raw = f"{request.title}{datetime.now(timezone.utc).isoformat()}"
        digest = hashlib.sha256(raw.encode()).hexdigest()[:12]
        fid = f"fb-{digest}"
        created = datetime.now(timezone.utc).isoformat()
        row = {
            "feedback_id": fid,
            "project_id": request.project_id or "default",
            "title": request.title,
            "body": request.body,
            "source": request.source,
            "category": request.category,
            "user_email": request.user_email,
            "priority": request.priority,
            "status": "received",
            "created_at": created,
        }
        _FEEDBACK_STORE.insert(0, row)

        if settings.feedback_webhook_url:
            self._forward_webhook(row)

        self._schedule_feedback_notification(row)

        return FeedbackItemResponse(
            feedback_id=fid,
            project_id=row["project_id"],
            status="received",
            title=request.title,
            created_at=created,
        )

    def _schedule_feedback_notification(self, row: dict[str, Any]) -> None:
        """Fire-and-forget notification to org owners about new feedback."""
        import asyncio

        async def _send() -> None:
            try:
                from sqlalchemy import select

                from app.core.database import async_session_factory
                from app.models.user import User
                from app.services.notification_service import NotificationService

                async with async_session_factory() as db:
                    result = await db.execute(select(User).limit(1))
                    user = result.scalar_one_or_none()
                    if not user or not user.organization_id:
                        return

                    svc = NotificationService()
                    await svc.notify_feedback_received(
                        org_id=user.organization_id,
                        project_id=row.get("project_id"),
                        feedback_title=row.get("title", "Untitled"),
                        feedback_source=row.get("source", "unknown"),
                        db=db,
                    )
                    await db.commit()
            except Exception as exc:
                logger.warning("Feedback notification failed: %s", exc)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_send())
        except RuntimeError:
            pass

    def list_for_project(self, project_id: str | None) -> list[FeedbackItemResponse]:
        """List recent feedback, optionally filtered by project."""
        items = _FEEDBACK_STORE
        if project_id:
            items = [r for r in items if r["project_id"] == project_id]
        return [
            FeedbackItemResponse(
                feedback_id=r["feedback_id"],
                project_id=r["project_id"],
                status=r["status"],
                title=r["title"],
                created_at=r["created_at"],
            )
            for r in items[:100]
        ]

    def ingest_webhook(
        self, payload: FeedbackWebhookPayload, provider: str
    ) -> FeedbackItemResponse:
        """Normalize inbound webhooks from Intercom, Canny, Zendesk, etc."""
        title = payload.title or f"Inbound from {provider}"
        body = payload.body or "(no body)"
        req = FeedbackSubmitRequest(
            project_id=payload.project_id,
            source="intercom" if provider == "intercom" else "other",
            category="general",
            title=title[:200],
            body=body[:10_000],
        )
        return self.submit(req)

    def _forward_webhook(self, row: dict[str, Any]) -> None:
        try:
            httpx.post(
                settings.feedback_webhook_url,
                json=row,
                timeout=10.0,
            )
        except Exception as exc:
            logger.warning("Feedback webhook forward failed: %s", exc)
