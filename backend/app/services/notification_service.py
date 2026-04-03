"""Notification service — creates, delivers, and manages notifications.

Supports three channels: in-app (database), email (AgentMail), and SMS (Twilio).
Respects per-user preferences including quiet hours, channel toggles, and
notification type filters.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.notification import Notification, NotificationPreference
from app.models.user import User
from app.schemas.notification_schema import (
    ContactInfoUpdateRequest,
    ContactInfoUpdateResponse,
    NotificationCountResponse,
    NotificationListResponse,
    NotificationMarkReadResponse,
    NotificationPreferenceRequest,
    NotificationPreferenceResponse,
    NotificationResponse,
    SendNotificationRequest,
    SendNotificationResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

_TYPE_TO_PREF_FLAG: dict[str, str] = {
    "report_generated": "report_notifications",
    "budget_threshold": "budget_notifications",
    "budget_exhausted": "budget_notifications",
    "action_required": "action_required_notifications",
    "feedback_received": "feedback_notifications",
    "agent_status_change": "agent_status_notifications",
    "cto_review_scheduled": "action_required_notifications",
    "orchestration_complete": "report_notifications",
    "security_alert": "security_notifications",
    "system": "action_required_notifications",
}


class NotificationService:
    """Manages notification lifecycle: create, deliver, read, and preference CRUD."""

    # ── Preferences ──────────────────────────────────────────────

    async def get_preferences(
        self, user_id: UUID, db: AsyncSession, project_id: str | None = None,
    ) -> NotificationPreferenceResponse:
        pref = await self._get_or_create_preference(user_id, db, project_id)
        return self._pref_to_response(pref)

    async def update_preferences(
        self, user_id: UUID, request: NotificationPreferenceRequest, db: AsyncSession,
    ) -> NotificationPreferenceResponse:
        project_uuid = UUID(request.project_id) if request.project_id else None
        pref = await self._get_or_create_preference(user_id, db, request.project_id)

        pref.project_id = project_uuid
        pref.email_enabled = request.email_enabled
        pref.sms_enabled = request.sms_enabled
        pref.in_app_enabled = request.in_app_enabled
        pref.report_notifications = request.report_notifications
        pref.budget_notifications = request.budget_notifications
        pref.action_required_notifications = request.action_required_notifications
        pref.feedback_notifications = request.feedback_notifications
        pref.agent_status_notifications = request.agent_status_notifications
        pref.security_notifications = request.security_notifications
        pref.budget_threshold_percent = request.budget_threshold_percent
        pref.budget_threshold_amount_usd = request.budget_threshold_amount_usd
        pref.digest_enabled = request.digest_enabled
        pref.digest_frequency = request.digest_frequency
        pref.quiet_hours_start = request.quiet_hours_start
        pref.quiet_hours_end = request.quiet_hours_end
        pref.timezone = request.timezone

        await db.flush()
        return self._pref_to_response(pref)

    async def _get_or_create_preference(
        self, user_id: UUID, db: AsyncSession, project_id: str | None = None,
    ) -> NotificationPreference:
        project_uuid = UUID(project_id) if project_id else None
        if project_uuid is None:
            project_filter = NotificationPreference.project_id.is_(None)
        else:
            project_filter = NotificationPreference.project_id == project_uuid
        stmt = select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            project_filter,
        )
        result = await db.execute(stmt)
        pref = result.scalar_one_or_none()

        if pref is None:
            pref = NotificationPreference(
                id=uuid4(),
                user_id=user_id,
                project_id=project_uuid,
            )
            db.add(pref)
            await db.flush()

        return pref

    # ── Contact Info ─────────────────────────────────────────────

    async def update_contact_info(
        self, user_id: UUID, request: ContactInfoUpdateRequest, db: AsyncSession,
    ) -> ContactInfoUpdateResponse:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise ValueError("User not found")

        if request.phone_number is not None:
            user.phone_number = request.phone_number

        prefs_result = await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id,
                NotificationPreference.project_id.is_(None),
            )
        )
        pref_exists = prefs_result.scalar_one_or_none() is not None
        created = False

        if not pref_exists:
            pref = NotificationPreference(id=uuid4(), user_id=user_id)
            db.add(pref)
            created = True

        await db.flush()

        return ContactInfoUpdateResponse(
            phone_number=user.phone_number,
            email=user.email,
            notification_preferences_created=created,
        )

    # ── Notification CRUD ────────────────────────────────────────

    async def list_notifications(
        self,
        user_id: UUID,
        db: AsyncSession,
        project_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
    ) -> NotificationListResponse:
        base = select(Notification).where(Notification.user_id == user_id)

        if project_id:
            base = base.where(Notification.project_id == UUID(project_id))
        if unread_only:
            base = base.where(Notification.read_at.is_(None))

        count_stmt = select(func.count()).select_from(base.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0

        unread_stmt = select(func.count()).select_from(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            ).subquery()
        )
        unread = (await db.execute(unread_stmt)).scalar() or 0

        items_stmt = base.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        items = (await db.execute(items_stmt)).scalars().all()

        return NotificationListResponse(
            notifications=[self._notif_to_response(n) for n in items],
            total_count=total,
            unread_count=unread,
        )

    async def get_notification_counts(
        self, user_id: UUID, db: AsyncSession,
    ) -> NotificationCountResponse:
        total_stmt = select(func.count(Notification.id)).where(Notification.user_id == user_id)
        total = (await db.execute(total_stmt)).scalar() or 0

        unread_stmt = select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        unread = (await db.execute(unread_stmt)).scalar() or 0

        priority_stmt = (
            select(Notification.priority, func.count(Notification.id))
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .group_by(Notification.priority)
        )
        priority_rows = (await db.execute(priority_stmt)).all()
        by_priority = {row[0]: row[1] for row in priority_rows}

        return NotificationCountResponse(
            total=total,
            unread=unread,
            by_priority=by_priority,
        )

    async def mark_as_read(
        self, user_id: UUID, notification_ids: list[str], db: AsyncSession,
    ) -> NotificationMarkReadResponse:
        uuids = [UUID(nid) for nid in notification_ids]
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.id.in_(uuids),
                Notification.read_at.is_(None),
            )
            .values(read_at=now, status="read")
        )
        result = await db.execute(stmt)
        return NotificationMarkReadResponse(marked_count=result.rowcount)

    async def mark_all_as_read(
        self, user_id: UUID, db: AsyncSession,
    ) -> NotificationMarkReadResponse:
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=now, status="read")
        )
        result = await db.execute(stmt)
        return NotificationMarkReadResponse(marked_count=result.rowcount)

    # ── Send / Create Notifications ──────────────────────────────

    async def send_notification(
        self, request: SendNotificationRequest, org_id: UUID, db: AsyncSession,
    ) -> SendNotificationResponse:
        """Create and deliver a notification to one or all org members."""
        if request.user_id:
            users = [await self._get_user(UUID(request.user_id), db)]
        else:
            users = await self._get_org_users(org_id, db)

        users = [u for u in users if u is not None]
        notification_ids: list[str] = []
        channels_used: set[str] = set()

        for user in users:
            pref = await self._get_or_create_preference(user.id, db, request.project_id)

            pref_flag = _TYPE_TO_PREF_FLAG.get(request.type, "action_required_notifications")
            if not getattr(pref, pref_flag, True):
                continue

            notif = Notification(
                id=uuid4(),
                user_id=user.id,
                organization_id=org_id,
                project_id=UUID(request.project_id) if request.project_id else None,
                type=request.type,
                priority=request.priority,
                title=request.title,
                body=request.body,
                link_url=request.link_url,
                channel=request.channel,
                status="pending",
                metadata_json=None,
            )
            db.add(notif)
            notification_ids.append(str(notif.id))

            used = await self._deliver(notif, user, pref)
            channels_used.update(used)

        await db.flush()

        return SendNotificationResponse(
            notification_ids=notification_ids,
            channels_used=sorted(channels_used),
            recipient_count=len(notification_ids),
        )

    async def notify_budget_threshold(
        self,
        user_id: UUID,
        org_id: UUID,
        project_id: str | None,
        agent_name: str,
        usage_percent: float,
        db: AsyncSession,
    ) -> None:
        """Fire a budget threshold notification for a specific agent."""
        priority = "critical" if usage_percent >= 100 else "high"
        ntype = "budget_exhausted" if usage_percent >= 100 else "budget_threshold"
        title = (
            f"Budget exhausted for {agent_name}"
            if usage_percent >= 100
            else f"Budget alert: {agent_name} at {usage_percent:.0f}%"
        )
        body = (
            f"Agent '{agent_name}' has consumed {usage_percent:.1f}% of its daily token budget. "
            f"{'All further requests will be throttled.' if usage_percent >= 100 else 'Consider reviewing allocation.'}"
        )
        app_url = settings.app_frontend_url.rstrip("/")
        link = f"{app_url}/budget"

        req = SendNotificationRequest(
            user_id=str(user_id),
            project_id=project_id,
            type=ntype,
            priority=priority,
            title=title,
            body=body,
            link_url=link,
            channel="all",
        )
        await self.send_notification(req, org_id, db)

    async def notify_report_generated(
        self,
        org_id: UUID,
        project_id: str | None,
        report_title: str,
        report_id: str,
        db: AsyncSession,
    ) -> None:
        """Notify all org members when a report is generated."""
        app_url = settings.app_frontend_url.rstrip("/")
        link = f"{app_url}/reports"

        req = SendNotificationRequest(
            project_id=project_id,
            type="report_generated",
            priority="medium",
            title=f"New report: {report_title}",
            body=f"A new report has been generated: '{report_title}'. View it in the reports dashboard.",
            link_url=link,
            channel="all",
        )
        await self.send_notification(req, org_id, db)

    async def notify_orchestration_complete(
        self,
        org_id: UUID,
        project_id: str | None,
        session_id: str,
        summary: str,
        db: AsyncSession,
    ) -> None:
        """Notify when an agentic orchestration session completes."""
        app_url = settings.app_frontend_url.rstrip("/")
        link = f"{app_url}/reports"

        req = SendNotificationRequest(
            project_id=project_id,
            type="orchestration_complete",
            priority="medium",
            title="Agent session completed",
            body=f"An agent orchestration session has completed. Summary: {summary[:500]}",
            link_url=link,
            channel="all",
        )
        await self.send_notification(req, org_id, db)

    async def notify_action_required(
        self,
        user_id: UUID,
        org_id: UUID,
        project_id: str | None,
        title: str,
        body: str,
        link_path: str = "/dashboard",
        db: AsyncSession | None = None,
    ) -> None:
        """Generic action-required notification."""
        if db is None:
            return
        app_url = settings.app_frontend_url.rstrip("/")
        req = SendNotificationRequest(
            user_id=str(user_id),
            project_id=project_id,
            type="action_required",
            priority="high",
            title=title,
            body=body,
            link_url=f"{app_url}{link_path}",
            channel="all",
        )
        await self.send_notification(req, org_id, db)

    async def notify_feedback_received(
        self,
        org_id: UUID,
        project_id: str | None,
        feedback_title: str,
        feedback_source: str,
        db: AsyncSession,
    ) -> None:
        """Notify project owners when feedback is submitted."""
        app_url = settings.app_frontend_url.rstrip("/")
        req = SendNotificationRequest(
            project_id=project_id,
            type="feedback_received",
            priority="low",
            title=f"New feedback: {feedback_title[:100]}",
            body=f"Feedback from {feedback_source}: '{feedback_title}'. Review it in the feedback dashboard.",
            link_url=f"{app_url}/dashboard",
            channel="email_sms",
        )
        await self.send_notification(req, org_id, db)

    async def notify_cto_review_scheduled(
        self,
        org_id: UUID,
        project_id: str | None,
        review_date: str,
        db: AsyncSession,
    ) -> None:
        """Notify when a CTO review session is scheduled."""
        app_url = settings.app_frontend_url.rstrip("/")
        req = SendNotificationRequest(
            project_id=project_id,
            type="cto_review_scheduled",
            priority="high",
            title="CTO review session scheduled",
            body=f"A CTO review session has been scheduled for {review_date}. Join via the CTO Call page.",
            link_url=f"{app_url}/cto-call",
            channel="all",
        )
        await self.send_notification(req, org_id, db)

    # ── Delivery ─────────────────────────────────────────────────

    async def _deliver(
        self,
        notification: Notification,
        user: User,
        pref: NotificationPreference,
    ) -> list[str]:
        """Deliver notification via enabled channels. Returns channel names used."""
        channels: list[str] = []
        now = datetime.now(timezone.utc)

        if self._is_quiet_hours(pref):
            notification.status = "sent"
            channels.append("in_app")
            return channels

        if pref.in_app_enabled:
            notification.status = "sent"
            channels.append("in_app")

        should_email = (
            pref.email_enabled
            and notification.channel in ("email", "email_sms", "all")
        )
        should_sms = (
            pref.sms_enabled
            and user.phone_number
            and notification.channel in ("sms", "email_sms", "all")
        )

        if should_email:
            sent = await self._send_email(user.email, notification)
            if sent:
                notification.email_sent_at = now
                channels.append("email")

        if should_sms:
            sent = await self._send_sms(user.phone_number, notification)
            if sent:
                notification.sms_sent_at = now
                channels.append("sms")

        if channels:
            notification.status = "delivered"

        return channels

    async def _send_email(self, email: str, notification: Notification) -> bool:
        """Send notification email via AgentMail."""
        if not settings.agentmail_api_key:
            logger.debug("AgentMail not configured; skipping email for notification %s", notification.id)
            return False

        try:
            from agentmail import AgentMail

            client = AgentMail(api_key=settings.agentmail_api_key)
            inbox = client.inboxes.create(display_name="SWEAAS Notifications")

            body_html = self._format_email_body(notification)
            inbox.send(
                to=email,
                subject=f"[SWEAAS] {notification.title}",
                body=body_html,
            )
            logger.info("Email sent to %s for notification %s", email, notification.id)
            return True
        except Exception as exc:
            logger.error("Email send failed for %s: %s", email, exc)
            return False

    async def _send_sms(self, phone: str, notification: Notification) -> bool:
        """Send notification SMS via Twilio."""
        if not settings.twilio_account_sid or not settings.twilio_auth_token:
            logger.debug("Twilio not configured; skipping SMS for notification %s", notification.id)
            return False

        try:
            from twilio.rest import Client

            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            sms_body = f"SWEAAS: {notification.title}\n{notification.body[:300]}"
            if notification.link_url:
                sms_body += f"\n{notification.link_url}"

            client.messages.create(
                body=sms_body,
                from_=settings.twilio_from_number,
                to=phone,
            )
            logger.info("SMS sent to %s for notification %s", phone, notification.id)
            return True
        except Exception as exc:
            logger.error("SMS send failed for %s: %s", phone, exc)
            return False

    def _format_email_body(self, notification: Notification) -> str:
        priority_label = {
            "low": "Info",
            "medium": "Notice",
            "high": "Important",
            "critical": "URGENT",
        }.get(notification.priority, "Notice")

        link_section = ""
        if notification.link_url:
            link_section = f'<p><a href="{notification.link_url}" style="color:#7c5cff;font-weight:600;">View in SWEAAS</a></p>'

        return f"""
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <div style="background:linear-gradient(135deg,#5a3dc7,#7c5cff);padding:16px 24px;border-radius:12px 12px 0 0;">
                <h2 style="color:#fff;margin:0;font-size:18px;">SWEAAS</h2>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
                <div style="display:inline-block;background:{'#fef2f2' if notification.priority in ('high','critical') else '#f0fdf4'};
                    color:{'#dc2626' if notification.priority in ('high','critical') else '#16a34a'};
                    padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:16px;">
                    {priority_label}
                </div>
                <h3 style="margin:12px 0 8px;color:#1f2937;font-size:16px;">{notification.title}</h3>
                <p style="color:#4b5563;font-size:14px;line-height:1.6;">{notification.body}</p>
                {link_section}
            </div>
            <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">
                You received this because you opted in to SWEAAS notifications.
                Manage preferences in Settings.
            </p>
        </div>
        """

    def _is_quiet_hours(self, pref: NotificationPreference) -> bool:
        if pref.quiet_hours_start is None or pref.quiet_hours_end is None:
            return False
        now_utc = datetime.now(timezone.utc)
        current_hour = now_utc.hour
        start, end = pref.quiet_hours_start, pref.quiet_hours_end
        if start <= end:
            return start <= current_hour < end
        return current_hour >= start or current_hour < end

    # ── Helpers ──────────────────────────────────────────────────

    async def _get_user(self, user_id: UUID, db: AsyncSession) -> User | None:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def _get_org_users(self, org_id: UUID, db: AsyncSession) -> list[User]:
        result = await db.execute(select(User).where(User.organization_id == org_id))
        return list(result.scalars().all())

    def _pref_to_response(self, pref: NotificationPreference) -> NotificationPreferenceResponse:
        return NotificationPreferenceResponse(
            id=str(pref.id),
            user_id=str(pref.user_id),
            project_id=str(pref.project_id) if pref.project_id else None,
            email_enabled=pref.email_enabled,
            sms_enabled=pref.sms_enabled,
            in_app_enabled=pref.in_app_enabled,
            report_notifications=pref.report_notifications,
            budget_notifications=pref.budget_notifications,
            action_required_notifications=pref.action_required_notifications,
            feedback_notifications=pref.feedback_notifications,
            agent_status_notifications=pref.agent_status_notifications,
            security_notifications=pref.security_notifications,
            budget_threshold_percent=pref.budget_threshold_percent,
            budget_threshold_amount_usd=pref.budget_threshold_amount_usd,
            digest_enabled=pref.digest_enabled,
            digest_frequency=pref.digest_frequency,
            quiet_hours_start=pref.quiet_hours_start,
            quiet_hours_end=pref.quiet_hours_end,
            timezone=pref.timezone,
            created_at=pref.created_at.isoformat() if pref.created_at else "",
            updated_at=pref.updated_at.isoformat() if pref.updated_at else "",
        )

    def _notif_to_response(self, notif: Notification) -> NotificationResponse:
        return NotificationResponse(
            id=str(notif.id),
            type=notif.type,
            priority=notif.priority,
            title=notif.title,
            body=notif.body,
            link_url=notif.link_url,
            channel=notif.channel,
            status=notif.status,
            project_id=str(notif.project_id) if notif.project_id else None,
            read_at=notif.read_at.isoformat() if notif.read_at else None,
            created_at=notif.created_at.isoformat() if notif.created_at else "",
        )
