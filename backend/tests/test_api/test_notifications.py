"""Notification endpoint tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.main import app
from app.core.dependencies import get_notification_service
from app.core.database import get_db


class FakeUser:
    def __init__(self):
        self.id = "00000000-0000-0000-0000-000000000099"
        self.supabase_uid = "dev-user"
        self.email = "user@sweaas.dev"
        self.organization_id = "00000000-0000-0000-0000-000000000001"


class FakeNotificationService:
    async def list_notifications(self, user_id, db, project_id=None, limit=50, offset=0, unread_only=False):
        from app.schemas.notification_schema import NotificationListResponse
        return NotificationListResponse(notifications=[], total_count=0, unread_count=0)

    async def get_notification_counts(self, user_id, db):
        from app.schemas.notification_schema import NotificationCountResponse
        return NotificationCountResponse(total=5, unread=2, by_priority={"high": 1, "medium": 1})

    async def mark_as_read(self, user_id, notification_ids, db):
        from app.schemas.notification_schema import NotificationMarkReadResponse
        return NotificationMarkReadResponse(marked_count=len(notification_ids))

    async def mark_all_as_read(self, user_id, db):
        from app.schemas.notification_schema import NotificationMarkReadResponse
        return NotificationMarkReadResponse(marked_count=5)

    async def get_preferences(self, user_id, db, project_id=None):
        from app.schemas.notification_schema import NotificationPreferenceResponse
        return NotificationPreferenceResponse(
            id="pref-001", user_id=str(user_id), email_enabled=True, sms_enabled=True,
            in_app_enabled=True, report_notifications=True, budget_notifications=True,
            action_required_notifications=True, feedback_notifications=True,
            agent_status_notifications=True, security_notifications=True,
            budget_threshold_percent=85.0, budget_threshold_amount_usd=None,
            digest_enabled=False, digest_frequency="daily",
            quiet_hours_start=None, quiet_hours_end=None, timezone="UTC",
            created_at="2026-04-01T00:00:00Z", updated_at="2026-04-01T00:00:00Z",
        )

    async def update_preferences(self, user_id, request, db):
        return await self.get_preferences(user_id, db)

    async def update_contact_info(self, user_id, request, db):
        from app.schemas.notification_schema import ContactInfoUpdateResponse
        return ContactInfoUpdateResponse(phone_number="+1234567890", email="user@sweaas.dev", notification_preferences_created=False)

    async def send_notification(self, request, org_id, db):
        from app.schemas.notification_schema import SendNotificationResponse
        return SendNotificationResponse(notification_ids=["notif-001"], channels_used=["in_app"], recipient_count=1)


@pytest.fixture
def notif_client(client):
    fake_user = FakeUser()
    session = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = fake_user
    session.execute.return_value = result_mock

    async def fake_db():
        yield session

    app.dependency_overrides[get_db] = fake_db
    app.dependency_overrides[get_notification_service] = lambda: FakeNotificationService()
    yield client
    app.dependency_overrides.clear()


def test_list_notifications(notif_client):
    resp = notif_client.get("/api/v1/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert "notifications" in data
    assert "total_count" in data


def test_notification_counts(notif_client):
    resp = notif_client.get("/api/v1/notifications/count")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert data["unread"] == 2


def test_mark_read(notif_client):
    resp = notif_client.post(
        "/api/v1/notifications/read",
        json={"notification_ids": ["notif-001", "notif-002"]},
    )
    assert resp.status_code == 200
    assert resp.json()["marked_count"] == 2


def test_mark_read_empty_list(notif_client):
    resp = notif_client.post("/api/v1/notifications/read", json={"notification_ids": []})
    assert resp.status_code == 422


def test_mark_all_read(notif_client):
    resp = notif_client.post("/api/v1/notifications/read-all")
    assert resp.status_code == 200
    assert resp.json()["marked_count"] == 5


def test_get_preferences(notif_client):
    resp = notif_client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email_enabled"] is True
    assert data["budget_threshold_percent"] == 85.0


def test_update_preferences(notif_client):
    resp = notif_client.put(
        "/api/v1/notifications/preferences",
        json={"email_enabled": False, "budget_threshold_percent": 90.0},
    )
    assert resp.status_code == 200


def test_update_contact_info(notif_client):
    resp = notif_client.put(
        "/api/v1/notifications/contact-info",
        json={"phone_number": "+1234567890"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["phone_number"] == "+1234567890"


def test_update_contact_info_invalid_phone(notif_client):
    resp = notif_client.put(
        "/api/v1/notifications/contact-info",
        json={"phone_number": "bad"},
    )
    assert resp.status_code == 422


def test_send_notification(notif_client):
    resp = notif_client.post(
        "/api/v1/notifications/send",
        json={"title": "Test Alert", "body": "Something happened", "priority": "high"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["recipient_count"] == 1
