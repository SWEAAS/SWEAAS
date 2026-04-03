"""Schemas for communication endpoints."""

from typing import Any, Literal

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


class TavusReplica(BaseModel):
    replica_id: str
    replica_name: str
    thumbnail_video_url: str
    model_name: str
    poster_image_url: str | None = None


class TavusReplicaListResponse(BaseModel):
    replicas: list[TavusReplica]


class TavusWarmCheckAttempt(BaseModel):
    attempt: int
    delay_seconds: int
    status_code: int
    success: bool
    payload: dict[str, Any] = Field(default_factory=dict)


class TavusWarmCheckResponse(BaseModel):
    ok: bool
    attempts: list[TavusWarmCheckAttempt]


class TavusStoredReplicaSnapshot(BaseModel):
    replica_id: str
    replica_name: str
    thumbnail_video_url: str
    model_name: str
    updated_at: str | None = None


class TavusLiveReplicaSnapshot(BaseModel):
    replica_id: str
    replica_name: str
    thumbnail_video_url: str
    model_name: str


class TavusReplicaUsageSummary(BaseModel):
    organization_count: int = 0
    cto_assignment_count: int = 0
    team_assignment_count: int = 0
    total_assignment_count: int = 0


class TavusReconciliationItem(BaseModel):
    reason: Literal["name_mismatch", "missing_in_database", "updates_to_stored_replica"]
    actions: list[str]
    changed_fields: list[str] = Field(default_factory=list)
    database_replica: TavusStoredReplicaSnapshot | None = None
    live_replica: TavusLiveReplicaSnapshot | None = None
    impacted_onboarding_usage: TavusReplicaUsageSummary | None = None


class TavusReconciliationResponse(BaseModel):
    name_mismatch: list[TavusReconciliationItem]
    missing_in_database: list[TavusReconciliationItem]
    updates_to_stored_replica: list[TavusReconciliationItem]


class TavusReconciliationActionRequest(BaseModel):
    action: Literal[
        "append_new_replica",
        "update_stored_replica",
        "replace_with_live",
        "delete_database_replica",
        "dismiss",
    ]
    database_replica_id: str | None = None
    live_replica_id: str | None = None


class TavusReconciliationActionResponse(BaseModel):
    applied: bool
    replica: TavusReplica | None = None


class TavusConfigResourceCheck(BaseModel):
    configured_id: str
    found: bool
    status_code: int
    detail: str = ""
    name: str | None = None


class TavusConfigCheckResponse(BaseModel):
    ok: bool
    api_key_configured: bool
    internal_call_replica: TavusConfigResourceCheck | None = None
    internal_call_persona: TavusConfigResourceCheck | None = None
    warnings: list[str] = Field(default_factory=list)


class InternalCallTarget(BaseModel):
    agent_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=120)
    department: Literal["engineering", "marketing", "product", "support"]
    hierarchy_level: Literal["cto", "manager", "specialist"]


class CTOCallRequest(BaseModel):
    project_id: str | None = None
    topic: str = Field(
        default="New project kickoff — interview me about what I want to build",
        min_length=2,
        max_length=500,
    )
    replica_id: str | None = Field(default=None, description="Override the default CTO replica")
    target: InternalCallTarget | None = None


class CTOCallResponse(BaseModel):
    conversation_url: str
    conversation_id: str
    status: str


class CustomerCallRequest(BaseModel):
    """Start a video call between an end user and the customer-support AI persona."""

    project_id: str = ""
    topic: str = Field(min_length=2, max_length=500)
    user_email: str | None = Field(default=None, max_length=320)


class CustomerCallResponse(BaseModel):
    conversation_url: str
    conversation_id: str
    status: str
    agent_hint: str = "sup-cs-01"


class ExplainerVideoRequest(BaseModel):
    project_id: str
    topic: str = Field(min_length=2, max_length=500)
    video_type: str = "sprint_summary"


class ExplainerVideoResponse(BaseModel):
    video_id: str
    status: str
    estimated_duration_seconds: int
