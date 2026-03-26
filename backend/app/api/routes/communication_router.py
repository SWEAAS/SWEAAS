"""Communication endpoints."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_communication_service
from app.schemas.communication_schema import (
    CalendarInviteRequest,
    CalendarInviteResponse,
    EmailMessageRequest,
    EmailMessageResponse,
)
from app.services.communication_service import CommunicationService

router = APIRouter(prefix="/communications", tags=["communications"])


@router.post("/emails", response_model=EmailMessageResponse)
def send_email(
    request: EmailMessageRequest,
    communication_service: CommunicationService = Depends(get_communication_service),
) -> EmailMessageResponse:
    return communication_service.send_email(request)


@router.post("/calendar-invites", response_model=CalendarInviteResponse)
def schedule_calendar_invite(
    request: CalendarInviteRequest,
    communication_service: CommunicationService = Depends(get_communication_service),
) -> CalendarInviteResponse:
    return communication_service.schedule_invite(request)
