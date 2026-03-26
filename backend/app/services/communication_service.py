"""Domain logic for email and calendar workflows."""

from uuid import uuid4

from app.schemas.communication_schema import (
    CalendarInviteRequest,
    CalendarInviteResponse,
    EmailMessageRequest,
    EmailMessageResponse,
)


class CommunicationService:
    """Handles communication-oriented actions."""

    def send_email(self, request: EmailMessageRequest) -> EmailMessageResponse:
        return EmailMessageResponse(
            message_id=f"mail-{uuid4().hex[:10]}",
            provider="agentmail",
            status=f"queued for {request.recipient}",
        )

    def schedule_invite(self, request: CalendarInviteRequest) -> CalendarInviteResponse:
        invite_id = f"invite-{uuid4().hex[:10]}"
        return CalendarInviteResponse(
            invite_id=invite_id,
            meeting_url=f"https://meet.sweaas.dev/{invite_id}",
            status=f"scheduled for {request.attendee_email} at {request.start_at}",
        )
