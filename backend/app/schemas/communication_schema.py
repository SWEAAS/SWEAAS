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


class CTOCallRequest(BaseModel):
    project_id: str
    topic: str = Field(min_length=2, max_length=500)


class CTOCallResponse(BaseModel):
    conversation_url: str
    conversation_id: str
    status: str


class ExplainerVideoRequest(BaseModel):
    project_id: str
    topic: str = Field(min_length=2, max_length=500)
    video_type: str = "sprint_summary"


class ExplainerVideoResponse(BaseModel):
    video_id: str
    status: str
    estimated_duration_seconds: int
