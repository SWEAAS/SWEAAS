"""Communication endpoint tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.main import app
from app.core.dependencies import get_communication_service
from app.core.database import get_db


class FakeCommunicationService:
    async def send_email(self, request):
        from app.schemas.communication_schema import EmailMessageResponse
        return EmailMessageResponse(message_id="msg-001", provider="agentmail", status="sent")

    async def schedule_invite(self, request):
        from app.schemas.communication_schema import CalendarInviteResponse
        return CalendarInviteResponse(invite_id="inv-001", meeting_url="https://meet.example.com/123", status="scheduled")

    async def create_cto_call(self, request, project_data=None):
        from app.schemas.communication_schema import CTOCallResponse
        return CTOCallResponse(conversation_url="https://tavus.io/c/123", conversation_id="conv-001", status="active")

    async def create_customer_support_call(self, request, project_data=None):
        from app.schemas.communication_schema import CustomerCallResponse
        return CustomerCallResponse(conversation_url="https://tavus.io/c/456", conversation_id="conv-002", status="active")

    async def create_explainer_video(self, request):
        from app.schemas.communication_schema import ExplainerVideoResponse
        return ExplainerVideoResponse(video_id="vid-001", status="processing", estimated_duration_seconds=120)

    async def inspect_tavus_internal_call_config(self):
        from app.schemas.communication_schema import TavusConfigCheckResponse
        return TavusConfigCheckResponse(ok=True, api_key_configured=True)


@pytest.fixture
def mock_db_session():
    session = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    session.execute.return_value = result_mock
    
    async def fake_db():
        yield session
    return fake_db, session


@pytest.fixture
def comm_client(client, mock_db_session):
    fake_db, _ = mock_db_session
    app.dependency_overrides[get_communication_service] = lambda: FakeCommunicationService()
    app.dependency_overrides[get_db] = fake_db
    yield client
    app.dependency_overrides.clear()


def test_send_email(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/email",
        json={"recipient": "user@example.com", "subject": "Hello", "body": "Test message body"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["message_id"] == "msg-001"
    assert data["status"] == "sent"


def test_send_email_invalid_recipient(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/email",
        json={"recipient": "not-an-email", "subject": "Hello", "body": "Test body"},
    )
    assert resp.status_code == 422


def test_schedule_invite(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/calendar/invite",
        json={
            "attendee_email": "user@example.com",
            "title": "Sprint Planning",
            "start_at": "2026-04-10T10:00:00Z",
            "duration_minutes": 30,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["invite_id"] == "inv-001"
    assert data["status"] == "scheduled"


def test_schedule_invite_invalid_duration(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/calendar/invite",
        json={
            "attendee_email": "user@example.com",
            "title": "Meeting",
            "start_at": "2026-04-10T10:00:00Z",
            "duration_minutes": 0,
        },
    )
    assert resp.status_code == 422


def test_cto_context(comm_client):
    resp = comm_client.get("/api/v1/communication/cto-context")
    assert resp.status_code == 200
    data = resp.json()
    assert "agents" in data
    assert "warnings" in data
    assert "active_tasks" in data
    assert "total_token_pct" in data
    assert isinstance(data["agents"], list)
    assert len(data["agents"]) > 0


def test_cto_call(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/cto-call",
        json={"topic": "Discuss project architecture"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_id"] == "conv-001"
    assert data["status"] == "active"


def test_cto_call_with_project_id(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/cto-call",
        json={"project_id": "proj-123", "topic": "Budget review"},
    )
    # Will get 404 since _fetch_project_data returns None (mocked DB returns None)
    assert resp.status_code == 404


def test_explainer_video(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/explainer-video",
        json={"project_id": "proj-001", "topic": "Sprint summary for Q1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == "vid-001"
    assert data["status"] == "processing"


def test_public_customer_call_missing_token(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/customer-call/public",
        json={"topic": "Need help with billing"},
    )
    assert resp.status_code == 401


def test_public_customer_call_invalid_token(comm_client):
    resp = comm_client.post(
        "/api/v1/communication/customer-call/public",
        json={"topic": "Need help with billing"},
        headers={"X-Project-Token": "invalid-token-xyz"},
    )
    assert resp.status_code == 403
