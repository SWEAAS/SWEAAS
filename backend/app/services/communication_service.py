"""Domain logic for email (AgentMail), calendar, and video call (Tavus) workflows."""

import logging
from uuid import uuid4

import httpx

from app.core.config import get_settings
from app.schemas.communication_schema import (
    CTOCallRequest,
    CTOCallResponse,
    CalendarInviteRequest,
    CalendarInviteResponse,
    EmailMessageRequest,
    EmailMessageResponse,
    ExplainerVideoRequest,
    ExplainerVideoResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()


class CommunicationService:
    """Handles AgentMail emails, calendar invites, Tavus CTO calls, and Golpo videos."""

    # ── AgentMail ────────────────────────────────────────────────

    async def send_email(self, request: EmailMessageRequest) -> EmailMessageResponse:
        """Send an email via AgentMail.

        Falls back to a stub response when the API key is not configured.
        """
        if not settings.agentmail_api_key:
            return EmailMessageResponse(
                message_id=f"mail-{uuid4().hex[:10]}",
                provider="agentmail",
                status=f"queued for {request.recipient} (dev mode)",
            )

        try:
            from agentmail import AgentMail

            client = AgentMail(api_key=settings.agentmail_api_key)
            inbox = client.inboxes.create(display_name="SWEAAS Agent")
            msg = inbox.send(
                to=request.recipient,
                subject=request.subject,
                body=request.body,
            )
            return EmailMessageResponse(
                message_id=str(msg.id), provider="agentmail", status="sent"
            )
        except Exception as exc:
            logger.error("AgentMail send failed: %s", exc)
            return EmailMessageResponse(
                message_id=f"mail-{uuid4().hex[:10]}",
                provider="agentmail",
                status=f"failed: {exc}",
            )

    # ── Calendar ─────────────────────────────────────────────────

    async def schedule_invite(self, request: CalendarInviteRequest) -> CalendarInviteResponse:
        invite_id = f"invite-{uuid4().hex[:10]}"
        return CalendarInviteResponse(
            invite_id=invite_id,
            meeting_url=f"https://meet.sweaas.dev/{invite_id}",
            status=f"scheduled for {request.attendee_email} at {request.start_at}",
        )

    # ── Tavus CTO Video Call ─────────────────────────────────────

    async def create_cto_call(self, request: CTOCallRequest) -> CTOCallResponse:
        """Start a Tavus CVI conversation for a CTO call.

        Requires TAVUS_API_KEY, TAVUS_REPLICA_ID, and TAVUS_PERSONA_ID.
        """
        if not settings.tavus_api_key:
            conv_id = f"conv-{uuid4().hex[:10]}"
            return CTOCallResponse(
                conversation_url=f"https://meet.sweaas.dev/cto/{conv_id}",
                conversation_id=conv_id,
                status="created (dev mode)",
            )

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://tavusapi.com/v2/conversations",
                headers={
                    "x-api-key": settings.tavus_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "replica_id": settings.tavus_replica_id,
                    "persona_id": settings.tavus_persona_id,
                    "conversation_name": f"CTO Call — {request.topic[:60]}",
                    "custom_greeting": f"Hello! I'm the CTO. Let's discuss: {request.topic}",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return CTOCallResponse(
                conversation_url=data["conversation_url"],
                conversation_id=data["conversation_id"],
                status="created",
            )

    # ── Golpo Explainer Videos ───────────────────────────────────

    async def create_explainer_video(
        self, request: ExplainerVideoRequest
    ) -> ExplainerVideoResponse:
        """Generate an AI explainer video via Golpo.

        Requires GOLPO_API_KEY.
        """
        if not settings.golpo_api_key:
            return ExplainerVideoResponse(
                video_id=f"vid-{uuid4().hex[:10]}",
                status="queued (dev mode)",
                estimated_duration_seconds=60,
            )

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.golpoai.com/v1/videos",
                headers={
                    "Authorization": f"Bearer {settings.golpo_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": request.topic,
                    "style": "whiteboard",
                    "narration": True,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return ExplainerVideoResponse(
                video_id=data.get("id", f"vid-{uuid4().hex[:10]}"),
                status=data.get("status", "queued"),
                estimated_duration_seconds=data.get("estimated_duration", 60),
            )
