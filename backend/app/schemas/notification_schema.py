"""Schemas for notification endpoints — preferences, notifications, and delivery."""

from typing import Literal

from pydantic import BaseModel, Field


NotificationType = Literal[
    "report_generated",
    "budget_threshold",
    "budget_exhausted",
    "action_required",
    "feedback_received",
    "agent_status_change",
    "cto_review_scheduled",
    "orchestration_complete",
    "security_alert",
    "system",
]

NotificationPriority = Literal["low", "medium", "high", "critical"]
NotificationChannel = Literal["in_app", "email", "sms", "email_sms", "all"]
NotificationStatus = Literal["pending", "sent", "delivered", "read", "failed"]
DigestFrequency = Literal["daily", "weekly", "none"]


# ── Notification Preference Schemas ──────────────────────────────


class NotificationPreferenceRequest(BaseModel):
    project_id: str | None = Field(default=None, description="Project-specific overrides; null = org-wide defaults")

    email_enabled: bool = True
    sms_enabled: bool = True
    in_app_enabled: bool = True

    report_notifications: bool = True
    budget_notifications: bool = True
    action_required_notifications: bool = True
    feedback_notifications: bool = True
    agent_status_notifications: bool = True
    security_notifications: bool = True

    budget_threshold_percent: float = Field(default=85.0, ge=10.0, le=100.0)
    budget_threshold_amount_usd: float | None = Field(default=None, ge=0)

    digest_enabled: bool = False
    digest_frequency: DigestFrequency = "daily"

    quiet_hours_start: int | None = Field(default=None, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=None, ge=0, le=23)
    timezone: str = Field(default="UTC", max_length=50)


class NotificationPreferenceResponse(BaseModel):
    id: str
    user_id: str
    project_id: str | None = None

    email_enabled: bool
    sms_enabled: bool
    in_app_enabled: bool

    report_notifications: bool
    budget_notifications: bool
    action_required_notifications: bool
    feedback_notifications: bool
    agent_status_notifications: bool
    security_notifications: bool

    budget_threshold_percent: float
    budget_threshold_amount_usd: float | None

    digest_enabled: bool
    digest_frequency: str

    quiet_hours_start: int | None
    quiet_hours_end: int | None
    timezone: str

    created_at: str
    updated_at: str


# ── Notification Schemas ─────────────────────────────────────────


class NotificationResponse(BaseModel):
    id: str
    type: NotificationType
    priority: NotificationPriority
    title: str
    body: str
    link_url: str | None = None
    channel: str
    status: str
    project_id: str | None = None
    read_at: str | None = None
    created_at: str


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    total_count: int
    unread_count: int


class NotificationMarkReadRequest(BaseModel):
    notification_ids: list[str] = Field(min_length=1, max_length=100)


class NotificationMarkReadResponse(BaseModel):
    marked_count: int


class NotificationCountResponse(BaseModel):
    total: int
    unread: int
    by_priority: dict[str, int]


# ── Contact Info Update (for onboarding integration) ─────────────


class ContactInfoUpdateRequest(BaseModel):
    phone_number: str | None = Field(default=None, max_length=20, pattern=r"^\+?[1-9]\d{6,14}$")
    notification_email: str | None = Field(default=None, max_length=320)


class ContactInfoUpdateResponse(BaseModel):
    phone_number: str | None
    email: str
    notification_preferences_created: bool


# ── Send Notification (internal / admin) ─────────────────────────


class SendNotificationRequest(BaseModel):
    user_id: str | None = Field(default=None, description="Target a specific user; null = all org members")
    project_id: str | None = None
    type: NotificationType = "system"
    priority: NotificationPriority = "medium"
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=5000)
    link_url: str | None = Field(default=None, max_length=500)
    channel: NotificationChannel = "all"


class SendNotificationResponse(BaseModel):
    notification_ids: list[str]
    channels_used: list[str]
    recipient_count: int
