"""Schemas for communication endpoints."""

from pydantic import BaseModel, EmailStr, Field


class EmailMessageRequest(BaseModel):
    recipient: EmailStr
    subject: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=2, max_length=5_000)


class EmailMessageResponse(BaseModel):
    message_id: str
    provider: str
    status: str


class CalendarInviteRequest(BaseModel):
    attendee_email: EmailStr
    title: str = Field(min_length=2, max_length=160)
    start_at: str
    duration_minutes: int = Field(gt=0, le=480)
    notes: str = Field(default="", max_length=500)


class CalendarInviteResponse(BaseModel):
    invite_id: str
    meeting_url: str
    status: str
