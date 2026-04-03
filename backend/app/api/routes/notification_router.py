"""Notification endpoints — in-app notifications, preferences, contact info, and delivery."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_notification_service
from app.models.user import User
from app.schemas.notification_schema import (
    ContactInfoUpdateRequest,
    ContactInfoUpdateResponse,
    NotificationCountResponse,
    NotificationListResponse,
    NotificationMarkReadRequest,
    NotificationMarkReadResponse,
    NotificationPreferenceRequest,
    NotificationPreferenceResponse,
    SendNotificationRequest,
    SendNotificationResponse,
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def _resolve_user(user: AuthenticatedUser, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.supabase_uid == user.uid))
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(status_code=400, detail="User not found in database.")
    return db_user


# ── Notification list / counts ───────────────────────────────────


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
    project_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = Query(default=False),
) -> NotificationListResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.list_notifications(
        db_user.id, db, project_id=project_id, limit=limit, offset=offset, unread_only=unread_only,
    )


@router.get("/count", response_model=NotificationCountResponse)
async def get_notification_counts(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> NotificationCountResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.get_notification_counts(db_user.id, db)


# ── Mark as read ─────────────────────────────────────────────────


@router.post("/read", response_model=NotificationMarkReadResponse)
async def mark_notifications_read(
    request: NotificationMarkReadRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> NotificationMarkReadResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.mark_as_read(db_user.id, request.notification_ids, db)


@router.post("/read-all", response_model=NotificationMarkReadResponse)
async def mark_all_notifications_read(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> NotificationMarkReadResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.mark_all_as_read(db_user.id, db)


# ── Preferences ──────────────────────────────────────────────────


@router.get("/preferences", response_model=NotificationPreferenceResponse)
async def get_preferences(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
    project_id: str | None = Query(default=None),
) -> NotificationPreferenceResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.get_preferences(db_user.id, db, project_id=project_id)


@router.put("/preferences", response_model=NotificationPreferenceResponse)
async def update_preferences(
    request: NotificationPreferenceRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> NotificationPreferenceResponse:
    db_user = await _resolve_user(user, db)
    return await notification_service.update_preferences(db_user.id, request, db)


# ── Contact Info ─────────────────────────────────────────────────


@router.put("/contact-info", response_model=ContactInfoUpdateResponse)
async def update_contact_info(
    request: ContactInfoUpdateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> ContactInfoUpdateResponse:
    db_user = await _resolve_user(user, db)
    try:
        return await notification_service.update_contact_info(db_user.id, request, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Admin: send a notification ───────────────────────────────────


@router.post("/send", response_model=SendNotificationResponse)
async def send_notification(
    request: SendNotificationRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    notification_service: Annotated[NotificationService, Depends(get_notification_service)],
) -> SendNotificationResponse:
    """Send a notification to a user or all org members. Requires owner/admin role."""
    db_user = await _resolve_user(user, db)
    if db_user.organization_id is None:
        raise HTTPException(status_code=400, detail="User is not associated with an organization.")
    return await notification_service.send_notification(request, db_user.organization_id, db)
