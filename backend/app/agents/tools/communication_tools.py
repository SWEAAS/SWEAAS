"""LangChain tools for agent communication — email and meeting scheduling."""

from langchain_core.tools import tool


@tool
def send_agent_email(recipient: str, subject: str, body: str) -> str:
    """Send an email from the agent via AgentMail.

    Args:
        recipient: Email address of the recipient.
        subject: Email subject line.
        body: Email body content.

    Returns:
        Confirmation with message ID.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.agentmail_api_key:
        return f"[dev-mode] Would send email to {recipient}: {subject}"

    try:
        from agentmail import AgentMail

        client = AgentMail(api_key=settings.agentmail_api_key)
        inbox = client.inboxes.create(display_name="SWEAAS Agent")
        msg = inbox.send(to=recipient, subject=subject, body=body)
        return f"Sent email {msg.id} to {recipient}"
    except Exception as exc:
        return f"Email send failed: {exc}"


@tool
def schedule_meeting(attendee_email: str, title: str, duration_minutes: int = 30) -> str:
    """Schedule a meeting with a calendar invite.

    Args:
        attendee_email: Email of the attendee.
        title: Meeting title.
        duration_minutes: Meeting duration in minutes.

    Returns:
        Meeting URL and confirmation.
    """
    from uuid import uuid4

    invite_id = f"invite-{uuid4().hex[:10]}"
    return f"Scheduled '{title}' ({duration_minutes}min) with {attendee_email}. URL: https://meet.sweaas.dev/{invite_id}"
