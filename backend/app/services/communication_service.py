"""Domain logic for email (AgentMail), calendar, and video call (Tavus) workflows."""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

import httpx

from app.core.config import get_settings
from app.schemas.communication_schema import (
    CalendarInviteRequest,
    CalendarInviteResponse,
    CTOCallRequest,
    CTOCallResponse,
    CustomerCallRequest,
    CustomerCallResponse,
    EmailMessageRequest,
    EmailMessageResponse,
    ExplainerVideoRequest,
    ExplainerVideoResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _build_cto_context(project: dict[str, Any]) -> str:
    """Format project data into conversational context for the CTO persona."""
    parts = [
        f"Project: {project['name']}",
        f"Status: {project['status']}",
    ]
    if project.get("description"):
        parts.append(f"Description: {project['description']}")
    if project.get("github_repo_url"):
        parts.append(f"Repository: {project['github_repo_url']}")
    if project.get("sentry_project_slug"):
        parts.append(f"Error tracking: Sentry project '{project['sentry_project_slug']}'")
    if project.get("monthly_budget_usd"):
        parts.append(f"Monthly budget: ${project['monthly_budget_usd']:.0f}")
    if project.get("timeline_weeks"):
        parts.append(f"Timeline: {project['timeline_weeks']} weeks")
    if project.get("departments"):
        parts.append(f"Departments: {project['departments']}")
    if project.get("agent_activity"):
        parts.append(f"\nLive agent activity right now:\n{project['agent_activity']}")
    if project.get("budget_warnings"):
        parts.append(f"\nBudget warnings:\n{project['budget_warnings']}")
    return "\n".join(parts)


def _build_customer_context(project: dict[str, Any]) -> str:
    """Format project data into conversational context for the customer support persona.

    Excludes internal details (repo URLs, budgets) that end users should not see.
    """
    parts = [
        f"Product: {project['name']}",
    ]
    if project.get("description"):
        parts.append(f"Description: {project['description']}")
    parts.append(
        "You are supporting end users of this product. "
        "Help them with questions, issues, and feedback."
    )
    return "\n".join(parts)


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

    async def create_cto_call(
        self,
        request: CTOCallRequest,
        project_data: dict[str, Any] | None = None,
    ) -> CTOCallResponse:
        """Start a Tavus CVI conversation for a CTO call.

        Requires TAVUS_API_KEY, TAVUS_REPLICA_ID, and TAVUS_PERSONA_ID.
        ``project_data`` is a dict of project fields used to build
        ``conversational_context`` so the persona is project-aware.
        """
        if not settings.tavus_api_key:
            conv_id = f"conv-{uuid4().hex[:10]}"
            return CTOCallResponse(
                conversation_url=f"https://meet.sweaas.dev/cto/{conv_id}",
                conversation_id=conv_id,
                status="created (dev mode)",
            )

        payload: dict[str, Any] = {
            "replica_id": settings.tavus_replica_id,
            "persona_id": settings.tavus_persona_id,
            "conversation_name": f"CTO Call — {request.topic[:60]}",
            "custom_greeting": f"Hello! I'm the CTO. Let's discuss: {request.topic}",
        }
        if project_data:
            payload["conversational_context"] = _build_cto_context(project_data)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://tavusapi.com/v2/conversations",
                headers={
                    "x-api-key": settings.tavus_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return CTOCallResponse(
                conversation_url=data["conversation_url"],
                conversation_id=data["conversation_id"],
                status="created",
            )

    # ── Customer video call (product users) via Tavus ────────────

    async def create_customer_support_call(
        self,
        request: CustomerCallRequest,
        project_data: dict[str, Any] | None = None,
    ) -> CustomerCallResponse:
        """Start a Tavus conversation for end-user / customer support calls.

        Uses TAVUS_CUSTOMER_REPLICA_ID / TAVUS_CUSTOMER_PERSONA_ID when set;
        otherwise falls back to the CTO replica/persona for dev.
        ``project_data`` is used to build ``conversational_context``.
        """
        replica = settings.tavus_customer_replica_id or settings.tavus_replica_id
        persona = settings.tavus_customer_persona_id or settings.tavus_persona_id

        if not settings.tavus_api_key:
            conv_id = f"conv-cust-{uuid4().hex[:10]}"
            return CustomerCallResponse(
                conversation_url=f"https://meet.sweaas.dev/customer/{conv_id}",
                conversation_id=conv_id,
                status="created (dev mode)",
                agent_hint="sup-cs-01",
            )

        payload: dict[str, Any] = {
            "replica_id": replica,
            "persona_id": persona,
            "conversation_name": f"Customer support — {request.topic[:60]}",
            "custom_greeting": (
                f"Hi! I'm here to help with your product. "
                f"You mentioned: {request.topic}"
            ),
        }
        if project_data:
            payload["conversational_context"] = _build_customer_context(project_data)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://tavusapi.com/v2/conversations",
                headers={
                    "x-api-key": settings.tavus_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return CustomerCallResponse(
                conversation_url=data["conversation_url"],
                conversation_id=data["conversation_id"],
                status="created",
                agent_hint="sup-cs-01",
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
