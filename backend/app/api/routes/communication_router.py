"""Communication endpoints — email, calendar, CTO calls, and explainer videos."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.dependencies import get_communication_service
from app.schemas.communication_schema import (
    CTOCallRequest,
    CTOCallResponse,
    CalendarInviteRequest,
    CalendarInviteResponse,
    CustomerCallRequest,
    CustomerCallResponse,
    EmailMessageRequest,
    EmailMessageResponse,
    ExplainerVideoRequest,
    ExplainerVideoResponse,
)
from app.services.communication_service import CommunicationService

router = APIRouter(prefix="/communication", tags=["communication"])


@router.post("/email", response_model=EmailMessageResponse)
async def send_email(
    request: EmailMessageRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> EmailMessageResponse:
    """Send an email via AgentMail."""
    return await comm_service.send_email(request)


@router.post("/calendar/invite", response_model=CalendarInviteResponse)
async def schedule_invite(
    request: CalendarInviteRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> CalendarInviteResponse:
    """Schedule a calendar invite for a meeting."""
    return await comm_service.schedule_invite(request)


@router.post("/customer-call", response_model=CustomerCallResponse)
async def create_customer_call(
    request: CustomerCallRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> CustomerCallResponse:
    """Start a Tavus video session for **end users / customers** (support), not internal CTO.

    Uses customer replica/persona when `TAVUS_CUSTOMER_*` env vars are set. Chat-style
    support for product users uses `POST /agents/sup-cs-01/chat` with the Customer Support agent.
    """
    return await comm_service.create_customer_support_call(request)


@router.post("/cto-call", response_model=CTOCallResponse)
async def create_cto_call(
    request: CTOCallRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> CTOCallResponse:
    """Start a video call with the CTO agent via Tavus.

    Returns a conversation URL that can be embedded in the frontend
    for a face-to-face discussion with the AI CTO.
    """
    return await comm_service.create_cto_call(request)


@router.post("/explainer-video", response_model=ExplainerVideoResponse)
async def create_explainer_video(
    request: ExplainerVideoRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    comm_service: Annotated[CommunicationService, Depends(get_communication_service)],
) -> ExplainerVideoResponse:
    """Generate an AI explainer video via Golpo.

    Creates a whiteboard-style video summarizing sprint progress,
    architecture decisions, or other technical topics.
    """
    return await comm_service.create_explainer_video(request)
