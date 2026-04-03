"""Unit tests for NotificationService."""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from app.services.notification_service import NotificationService, _TYPE_TO_PREF_FLAG
from app.schemas.notification_schema import (
    NotificationPreferenceRequest,
    SendNotificationRequest,
)

USER_ID = uuid4()
ORG_ID = uuid4()
PROJECT_ID = str(uuid4())


def _make_pref(**overrides):
    """Build a fake NotificationPreference with sensible defaults."""
    defaults = dict(
        id=uuid4(),
        user_id=USER_ID,
        project_id=None,
        email_enabled=True,
        sms_enabled=True,
        in_app_enabled=True,
        report_notifications=True,
        budget_notifications=True,
        action_required_notifications=True,
        feedback_notifications=True,
        agent_status_notifications=True,
        security_notifications=True,
        budget_threshold_percent=85.0,
        budget_threshold_amount_usd=None,
        digest_enabled=False,
        digest_frequency="daily",
        quiet_hours_start=None,
        quiet_hours_end=None,
        timezone="UTC",
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_user(**overrides):
    defaults = dict(
        id=USER_ID,
        email="test@example.com",
        phone_number="+15551234567",
        organization_id=ORG_ID,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_notification(**overrides):
    defaults = dict(
        id=uuid4(),
        user_id=USER_ID,
        organization_id=ORG_ID,
        project_id=None,
        type="system",
        priority="medium",
        title="Test",
        body="Test body",
        link_url=None,
        channel="all",
        status="pending",
        email_sent_at=None,
        sms_sent_at=None,
        read_at=None,
        metadata_json=None,
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    return db


# ── get_preferences ──────────────────────────────────────────────


class TestGetPreferences:
    def test_returns_existing_preference(self):
        svc = NotificationService()
        pref = _make_pref()
        svc._get_or_create_preference = AsyncMock(return_value=pref)

        db = _mock_db()
        result = asyncio.run(svc.get_preferences(USER_ID, db))

        assert result.user_id == str(USER_ID)
        assert result.email_enabled is True

    def test_with_project_id(self):
        svc = NotificationService()
        pref = _make_pref(project_id=UUID(PROJECT_ID))
        svc._get_or_create_preference = AsyncMock(return_value=pref)

        db = _mock_db()
        result = asyncio.run(svc.get_preferences(USER_ID, db, project_id=PROJECT_ID))

        assert result.project_id == PROJECT_ID


# ── update_preferences ───────────────────────────────────────────


class TestUpdatePreferences:
    def test_updates_fields(self):
        svc = NotificationService()
        pref = _make_pref()
        svc._get_or_create_preference = AsyncMock(return_value=pref)

        db = _mock_db()
        request = NotificationPreferenceRequest(
            email_enabled=False,
            sms_enabled=False,
            quiet_hours_start=22,
            quiet_hours_end=7,
        )

        result = asyncio.run(svc.update_preferences(USER_ID, request, db))

        assert result.email_enabled is False
        assert result.sms_enabled is False
        assert result.quiet_hours_start == 22
        assert result.quiet_hours_end == 7
        db.flush.assert_awaited_once()


# ── list_notifications ───────────────────────────────────────────


class TestListNotifications:
    def test_returns_paginated_list(self):
        svc = NotificationService()
        db = _mock_db()

        notif = _make_notification()

        scalars_mock = MagicMock()
        scalars_mock.all.return_value = [notif]

        execute_results = [
            MagicMock(scalar=MagicMock(return_value=5)),
            MagicMock(scalar=MagicMock(return_value=2)),
            MagicMock(scalars=MagicMock(return_value=scalars_mock)),
        ]
        db.execute = AsyncMock(side_effect=execute_results)

        result = asyncio.run(svc.list_notifications(USER_ID, db))

        assert result.total_count == 5
        assert result.unread_count == 2
        assert len(result.notifications) == 1

    def test_empty_list(self):
        svc = NotificationService()
        db = _mock_db()

        scalars_mock = MagicMock()
        scalars_mock.all.return_value = []

        execute_results = [
            MagicMock(scalar=MagicMock(return_value=0)),
            MagicMock(scalar=MagicMock(return_value=0)),
            MagicMock(scalars=MagicMock(return_value=scalars_mock)),
        ]
        db.execute = AsyncMock(side_effect=execute_results)

        result = asyncio.run(svc.list_notifications(USER_ID, db))

        assert result.total_count == 0
        assert result.notifications == []


# ── get_notification_counts ──────────────────────────────────────


class TestGetNotificationCounts:
    def test_returns_counts(self):
        svc = NotificationService()
        db = _mock_db()

        execute_results = [
            MagicMock(scalar=MagicMock(return_value=10)),
            MagicMock(scalar=MagicMock(return_value=3)),
            MagicMock(all=MagicMock(return_value=[("high", 2), ("medium", 1)])),
        ]
        db.execute = AsyncMock(side_effect=execute_results)

        result = asyncio.run(svc.get_notification_counts(USER_ID, db))

        assert result.total == 10
        assert result.unread == 3
        assert result.by_priority == {"high": 2, "medium": 1}


# ── mark_as_read ─────────────────────────────────────────────────


class TestMarkAsRead:
    def test_marks_notifications(self):
        svc = NotificationService()
        db = _mock_db()

        nid = str(uuid4())
        mock_result = MagicMock()
        mock_result.rowcount = 1
        db.execute = AsyncMock(return_value=mock_result)

        result = asyncio.run(svc.mark_as_read(USER_ID, [nid], db))

        assert result.marked_count == 1

    def test_mark_all_as_read(self):
        svc = NotificationService()
        db = _mock_db()

        mock_result = MagicMock()
        mock_result.rowcount = 5
        db.execute = AsyncMock(return_value=mock_result)

        result = asyncio.run(svc.mark_all_as_read(USER_ID, db))

        assert result.marked_count == 5


# ── send_notification ────────────────────────────────────────────


class TestSendNotification:
    def test_sends_to_single_user(self):
        svc = NotificationService()
        db = _mock_db()

        user = _make_user()
        pref = _make_pref()

        svc._get_user = AsyncMock(return_value=user)
        svc._get_or_create_preference = AsyncMock(return_value=pref)
        svc._deliver = AsyncMock(return_value=["in_app", "email"])

        request = SendNotificationRequest(
            user_id=str(USER_ID),
            type="system",
            priority="medium",
            title="Hello",
            body="World",
            channel="all",
        )

        result = asyncio.run(svc.send_notification(request, ORG_ID, db))

        assert result.recipient_count == 1
        assert "in_app" in result.channels_used
        db.flush.assert_awaited_once()

    def test_sends_to_all_org_users(self):
        svc = NotificationService()
        db = _mock_db()

        users = [_make_user(id=uuid4()), _make_user(id=uuid4())]
        pref = _make_pref()

        svc._get_org_users = AsyncMock(return_value=users)
        svc._get_or_create_preference = AsyncMock(return_value=pref)
        svc._deliver = AsyncMock(return_value=["in_app"])

        request = SendNotificationRequest(
            type="system",
            priority="medium",
            title="Broadcast",
            body="Hello all",
            channel="all",
        )

        result = asyncio.run(svc.send_notification(request, ORG_ID, db))

        assert result.recipient_count == 2

    def test_skips_user_with_disabled_pref(self):
        svc = NotificationService()
        db = _mock_db()

        user = _make_user()
        pref = _make_pref(budget_notifications=False)

        svc._get_user = AsyncMock(return_value=user)
        svc._get_or_create_preference = AsyncMock(return_value=pref)
        svc._deliver = AsyncMock(return_value=["in_app"])

        request = SendNotificationRequest(
            user_id=str(USER_ID),
            type="budget_threshold",
            priority="high",
            title="Budget alert",
            body="You're at 90%",
            channel="all",
        )

        result = asyncio.run(svc.send_notification(request, ORG_ID, db))

        assert result.recipient_count == 0
        svc._deliver.assert_not_awaited()


# ── _deliver ─────────────────────────────────────────────────────


class TestDeliver:
    def test_quiet_hours_only_in_app(self):
        svc = NotificationService()
        notif = _make_notification(channel="all")
        user = _make_user()
        pref = _make_pref(quiet_hours_start=0, quiet_hours_end=23)

        svc._is_quiet_hours = MagicMock(return_value=True)

        channels = asyncio.run(svc._deliver(notif, user, pref))

        assert channels == ["in_app"]
        assert notif.status == "sent"

    def test_email_and_sms_delivery(self):
        svc = NotificationService()
        notif = _make_notification(channel="all")
        user = _make_user()
        pref = _make_pref()

        svc._is_quiet_hours = MagicMock(return_value=False)
        svc._send_email = AsyncMock(return_value=True)
        svc._send_sms = AsyncMock(return_value=True)

        channels = asyncio.run(svc._deliver(notif, user, pref))

        assert "in_app" in channels
        assert "email" in channels
        assert "sms" in channels
        assert notif.status == "delivered"

    def test_no_sms_without_phone(self):
        svc = NotificationService()
        notif = _make_notification(channel="all")
        user = _make_user(phone_number=None)
        pref = _make_pref()

        svc._is_quiet_hours = MagicMock(return_value=False)
        svc._send_email = AsyncMock(return_value=True)

        channels = asyncio.run(svc._deliver(notif, user, pref))

        assert "sms" not in channels


# ── _send_email ──────────────────────────────────────────────────


class TestSendEmail:
    def test_skips_when_no_api_key(self):
        svc = NotificationService()
        notif = _make_notification()

        with patch("app.services.notification_service.settings") as mock_settings:
            mock_settings.agentmail_api_key = ""
            result = asyncio.run(svc._send_email("test@example.com", notif))

        assert result is False

    def test_sends_with_agentmail(self):
        svc = NotificationService()
        notif = _make_notification()

        mock_inbox = MagicMock()
        mock_client = MagicMock()
        mock_client.inboxes.create.return_value = mock_inbox

        with patch("app.services.notification_service.settings") as mock_settings:
            mock_settings.agentmail_api_key = "key-123"
            with patch.dict(
                "sys.modules",
                {"agentmail": MagicMock(AgentMail=MagicMock(return_value=mock_client))},
            ):
                result = asyncio.run(svc._send_email("test@example.com", notif))

        assert result is True
        mock_inbox.send.assert_called_once()

    def test_returns_false_on_exception(self):
        svc = NotificationService()
        notif = _make_notification()

        with patch("app.services.notification_service.settings") as mock_settings:
            mock_settings.agentmail_api_key = "key-123"
            with patch.dict(
                "sys.modules",
                {"agentmail": MagicMock(AgentMail=MagicMock(side_effect=Exception("fail")))},
            ):
                result = asyncio.run(svc._send_email("test@example.com", notif))

        assert result is False


# ── _send_sms ────────────────────────────────────────────────────


class TestSendSms:
    def test_skips_when_no_credentials(self):
        svc = NotificationService()
        notif = _make_notification()

        with patch("app.services.notification_service.settings") as mock_settings:
            mock_settings.twilio_account_sid = ""
            mock_settings.twilio_auth_token = ""
            result = asyncio.run(svc._send_sms("+15551234567", notif))

        assert result is False

    def test_sends_with_twilio(self):
        svc = NotificationService()
        notif = _make_notification()

        mock_client = MagicMock()

        with patch("app.services.notification_service.settings") as mock_settings:
            mock_settings.twilio_account_sid = "sid"
            mock_settings.twilio_auth_token = "token"
            mock_settings.twilio_from_number = "+15550000000"
            with patch.dict(
                "sys.modules",
                {
                    "twilio": MagicMock(),
                    "twilio.rest": MagicMock(
                        Client=MagicMock(return_value=mock_client)
                    ),
                },
            ):
                result = asyncio.run(svc._send_sms("+15551234567", notif))

        assert result is True
        mock_client.messages.create.assert_called_once()


# ── _is_quiet_hours ──────────────────────────────────────────────


class TestIsQuietHours:
    def setup_method(self):
        self.svc = NotificationService()

    def test_no_quiet_hours_configured(self):
        pref = _make_pref(quiet_hours_start=None, quiet_hours_end=None)
        assert self.svc._is_quiet_hours(pref) is False

    def test_only_start_set(self):
        pref = _make_pref(quiet_hours_start=22, quiet_hours_end=None)
        assert self.svc._is_quiet_hours(pref) is False


# ── Helper notification methods ──────────────────────────────────


class TestHelperNotifiers:
    def test_notify_budget_threshold(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=["n1"], channels_used=["in_app"], recipient_count=1)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_budget_threshold(
                user_id=USER_ID,
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                agent_name="DevAgent",
                usage_percent=90.0,
                db=db,
            )
        )

        svc.send_notification.assert_awaited_once()
        req = svc.send_notification.call_args[0][0]
        assert req.type == "budget_threshold"
        assert req.priority == "high"

    def test_notify_budget_exhausted(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=[], channels_used=[], recipient_count=0)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_budget_threshold(
                user_id=USER_ID,
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                agent_name="DevAgent",
                usage_percent=100.0,
                db=db,
            )
        )

        req = svc.send_notification.call_args[0][0]
        assert req.type == "budget_exhausted"
        assert req.priority == "critical"

    def test_notify_report_generated(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=["n1"], channels_used=[], recipient_count=1)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_report_generated(
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                report_title="Weekly Summary",
                report_id="r-123",
                db=db,
            )
        )

        req = svc.send_notification.call_args[0][0]
        assert req.type == "report_generated"
        assert "Weekly Summary" in req.title

    def test_notify_orchestration_complete(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=["n1"], channels_used=[], recipient_count=1)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_orchestration_complete(
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                session_id="sess-abc",
                summary="All tasks done",
                db=db,
            )
        )

        req = svc.send_notification.call_args[0][0]
        assert req.type == "orchestration_complete"

    def test_notify_action_required_skips_without_db(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock()

        asyncio.run(
            svc.notify_action_required(
                user_id=USER_ID,
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                title="Review needed",
                body="Please check",
                db=None,
            )
        )

        svc.send_notification.assert_not_awaited()

    def test_notify_feedback_received(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=["n1"], channels_used=[], recipient_count=1)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_feedback_received(
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                feedback_title="Login bug",
                feedback_source="customer",
                db=db,
            )
        )

        req = svc.send_notification.call_args[0][0]
        assert req.type == "feedback_received"
        assert req.channel == "email_sms"

    def test_notify_cto_review_scheduled(self):
        svc = NotificationService()
        svc.send_notification = AsyncMock(
            return_value=MagicMock(notification_ids=["n1"], channels_used=[], recipient_count=1)
        )
        db = _mock_db()

        asyncio.run(
            svc.notify_cto_review_scheduled(
                org_id=ORG_ID,
                project_id=PROJECT_ID,
                review_date="2025-04-15",
                db=db,
            )
        )

        req = svc.send_notification.call_args[0][0]
        assert req.type == "cto_review_scheduled"
        assert req.priority == "high"


# ── _format_email_body ───────────────────────────────────────────


class TestFormatEmailBody:
    def test_contains_title_and_body(self):
        svc = NotificationService()
        notif = _make_notification(title="Alert!", body="Something happened", priority="high")
        html = svc._format_email_body(notif)

        assert "Alert!" in html
        assert "Something happened" in html
        assert "SWEAAS" in html

    def test_includes_link_when_present(self):
        svc = NotificationService()
        notif = _make_notification(link_url="https://app.sweaas.dev/dashboard")
        html = svc._format_email_body(notif)
        assert "https://app.sweaas.dev/dashboard" in html

    def test_no_link_section_when_no_url(self):
        svc = NotificationService()
        notif = _make_notification(link_url=None)
        html = svc._format_email_body(notif)
        assert "View in SWEAAS" not in html
