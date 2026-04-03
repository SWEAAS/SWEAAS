"""Domain logic for email (AgentMail), calendar, and video call (Tavus) workflows."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import HTTPException

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
    TavusConfigCheckResponse,
    TavusConfigResourceCheck,
)
from app.services.tavus_client import tavus_get, tavus_post

logger = logging.getLogger(__name__)
settings = get_settings()


def _extract_tavus_error_detail(data: dict[str, Any]) -> str:
    return data.get("message") or data.get("detail") or "Tavus request failed."


def _raise_tavus_conversation_error(
    *,
    status_code: int,
    data: dict[str, Any],
    replica_id: str,
    config_name: str,
) -> None:
    detail = _extract_tavus_error_detail(data)
    logger.warning(
        "Tavus conversation creation failed: status=%s replica_id=%s persona_config=%s detail=%s",
        status_code,
        replica_id,
        config_name,
        detail,
    )

    if "invalid persona_id" in detail.lower():
        raise HTTPException(
            status_code=502,
            detail=(
                f"Tavus rejected the configured {config_name} for this call. "
                f"The selected replica '{replica_id}' was sent correctly, but the conversation "
                f"persona is invalid or no longer exists in Tavus."
            ),
        )

    raise HTTPException(status_code=502, detail=detail)


def _format_role_label(role: str) -> str:
    return role.replace("_", " ")


def _build_internal_call_context(
    project: dict[str, Any],
    target: dict[str, Any] | None = None,
) -> str:
    """Format project and call-target data into conversational context."""
    parts = [
        f"Project: {project['name']}",
        f"Status: {project['status']}",
    ]
    if target:
        parts.extend(
            [
                "",
                "Internal call target:",
                f"- Name: {target['name']}",
                f"- Role: {_format_role_label(target['role'])}",
                f"- Department: {target['department']}",
                f"- Hierarchy level: {target['hierarchy_level']}",
                (
                    "Act like this person during the call. Keep the same reusable Tavus persona, "
                    "but adapt your words, priorities, and decisions to match this employee's role "
                    "and level in the org."
                ),
            ]
        )
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

        target = request.target.model_dump() if request.target else None
        display_name = target["name"] if target else "CTO"
        role_label = _format_role_label(target["role"]) if target else "chief technology officer"

        payload: dict[str, Any] = {
            "replica_id": request.replica_id or settings.tavus_replica_id,
            "persona_id": settings.tavus_persona_id,
            "conversation_name": f"Internal Call — {display_name[:60]}",
            "custom_greeting": f"Hello! I'm {display_name}, your {role_label}. Let's discuss: {request.topic}",
        }
        if project_data:
            payload["conversational_context"] = _build_internal_call_context(project_data, target)

        status_code, data = await tavus_post(
            "https://tavusapi.com/v2/conversations",
            headers={
                "x-api-key": settings.tavus_api_key,
                "Content-Type": "application/json",
            },
            json_body=payload,
        )
        if status_code == 402:
            raise HTTPException(
                status_code=402,
                detail="Tavus free tier limit reached. Upgrade your Tavus plan at tavus.io to start more conversations.",
            )
        if status_code >= 400:
            _raise_tavus_conversation_error(
                status_code=status_code,
                data=data,
                replica_id=payload["replica_id"],
                config_name="TAVUS_PERSONA_ID",
            )
        return CTOCallResponse(
            conversation_url=data["conversation_url"],
            conversation_id=data["conversation_id"],
            status="created",
        )

    async def inspect_tavus_internal_call_config(self) -> TavusConfigCheckResponse:
        warnings: list[str] = []
        if not settings.tavus_api_key:
            warnings.append("TAVUS_API_KEY is not configured.")
            return TavusConfigCheckResponse(
                ok=False,
                api_key_configured=False,
                warnings=warnings,
            )

        replica_check = await self._inspect_replica(settings.tavus_replica_id)
        persona_check = await self._inspect_persona(settings.tavus_persona_id)

        if not settings.tavus_replica_id:
            warnings.append("TAVUS_REPLICA_ID is empty.")
        if not settings.tavus_persona_id:
            warnings.append("TAVUS_PERSONA_ID is empty.")
        if persona_check and persona_check.found and replica_check and replica_check.found:
            persona_default_replica_id = await self._fetch_persona_default_replica_id(settings.tavus_persona_id)
            if persona_default_replica_id and persona_default_replica_id != settings.tavus_replica_id:
                warnings.append(
                    "The configured persona exists, but its default replica does not match TAVUS_REPLICA_ID."
                )

        return TavusConfigCheckResponse(
            ok=bool(
                settings.tavus_api_key
                and replica_check
                and replica_check.found
                and persona_check
                and persona_check.found
            ),
            api_key_configured=True,
            internal_call_replica=replica_check,
            internal_call_persona=persona_check,
            warnings=warnings,
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

        status_code, data = await tavus_post(
            "https://tavusapi.com/v2/conversations",
            headers={
                "x-api-key": settings.tavus_api_key,
                "Content-Type": "application/json",
            },
            json_body=payload,
        )
        if status_code == 402:
            raise HTTPException(
                status_code=402,
                detail="Tavus free tier limit reached. Upgrade your Tavus plan at tavus.io to start more conversations.",
            )
        if status_code >= 400:
            _raise_tavus_conversation_error(
                status_code=status_code,
                data=data,
                replica_id=payload["replica_id"],
                config_name=(
                    "TAVUS_CUSTOMER_PERSONA_ID"
                    if settings.tavus_customer_persona_id
                    else "TAVUS_PERSONA_ID"
                ),
            )
        return CustomerCallResponse(
            conversation_url=data["conversation_url"],
            conversation_id=data["conversation_id"],
            status="created",
            agent_hint="sup-cs-01",
        )

    def _tavus_headers(self) -> dict[str, str]:
        return {
            "x-api-key": settings.tavus_api_key,
            "Content-Type": "application/json",
        }

    async def _inspect_replica(self, replica_id: str) -> TavusConfigResourceCheck:
        if not replica_id:
            return TavusConfigResourceCheck(
                configured_id="",
                found=False,
                status_code=0,
                detail="No replica id configured.",
            )

        status_code, data = await tavus_get(
            f"https://tavusapi.com/v2/replicas/{quote(replica_id)}",
            headers=self._tavus_headers(),
        )
        found = 200 <= status_code < 300 and data.get("replica_id") == replica_id
        return TavusConfigResourceCheck(
            configured_id=replica_id,
            found=found,
            status_code=status_code,
            detail=_extract_tavus_error_detail(data) if not found else "",
            name=data.get("replica_name"),
        )

    async def _inspect_persona(self, persona_id: str) -> TavusConfigResourceCheck:
        if not persona_id:
            return TavusConfigResourceCheck(
                configured_id="",
                found=False,
                status_code=0,
                detail="No persona id configured.",
            )

        status_code, data = await tavus_get(
            "https://tavusapi.com/v2/personas?limit=100",
            headers=self._tavus_headers(),
        )
        personas = data.get("data") or data.get("personas") or []
        match = next((persona for persona in personas if persona.get("persona_id") == persona_id), None)
        found = 200 <= status_code < 300 and match is not None
        detail = ""
        if status_code >= 400:
            detail = _extract_tavus_error_detail(data)
        elif not found:
            detail = "Configured persona id was not found in the first page of Tavus personas."
        return TavusConfigResourceCheck(
            configured_id=persona_id,
            found=found,
            status_code=status_code,
            detail=detail,
            name=match.get("persona_name") if match else None,
        )

    async def _fetch_persona_default_replica_id(self, persona_id: str) -> str | None:
        status_code, data = await tavus_get(
            "https://tavusapi.com/v2/personas?limit=100",
            headers=self._tavus_headers(),
        )
        if status_code >= 400:
            return None
        personas = data.get("data") or data.get("personas") or []
        match = next((persona for persona in personas if persona.get("persona_id") == persona_id), None)
        if not match:
            return None
        return match.get("default_replica_id")

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
