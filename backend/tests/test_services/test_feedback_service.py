"""Unit tests for FeedbackService."""

from unittest.mock import patch, MagicMock

import pytest

from app.schemas.feedback_schema import (
    FeedbackSubmitRequest,
    FeedbackWebhookPayload,
)
from app.services import feedback_service as feedback_module
from app.services.feedback_service import FeedbackService


@pytest.fixture(autouse=True)
def _clear_store():
    feedback_module._FEEDBACK_STORE.clear()
    yield
    feedback_module._FEEDBACK_STORE.clear()


class TestSubmit:
    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_creates_feedback_entry(self, _mock_notif):
        svc = FeedbackService()
        req = FeedbackSubmitRequest(
            project_id="proj-1",
            source="in_app",
            category="bug",
            title="Button broken",
            body="The submit button doesn't work.",
            user_email="user@example.com",
            priority="high",
        )
        resp = svc.submit(req)
        assert resp.feedback_id.startswith("fb-")
        assert resp.project_id == "proj-1"
        assert resp.status == "received"
        assert resp.title == "Button broken"
        assert len(feedback_module._FEEDBACK_STORE) == 1

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_default_project_id(self, _mock_notif):
        svc = FeedbackService()
        req = FeedbackSubmitRequest(
            title="No project", body="Testing default project_id"
        )
        resp = svc.submit(req)
        assert resp.project_id == "default"

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    @patch("app.services.feedback_service.httpx.post")
    def test_webhook_forwarding(self, mock_post, _mock_notif):
        with patch("app.services.feedback_service.settings") as mock_settings:
            mock_settings.feedback_webhook_url = "https://hooks.example.com/feedback"
            svc = FeedbackService()
            req = FeedbackSubmitRequest(
                title="Webhook test", body="Should forward"
            )
            svc.submit(req)

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        assert call_kwargs[1]["json"]["title"] == "Webhook test"
        assert call_kwargs[0][0] == "https://hooks.example.com/feedback"

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    @patch("app.services.feedback_service.httpx.post", side_effect=Exception("timeout"))
    def test_webhook_failure_does_not_raise(self, _mock_post, _mock_notif):
        with patch("app.services.feedback_service.settings") as mock_settings:
            mock_settings.feedback_webhook_url = "https://hooks.example.com/feedback"
            svc = FeedbackService()
            req = FeedbackSubmitRequest(
                title="Webhook fail", body="Should not raise"
            )
            resp = svc.submit(req)
            assert resp.feedback_id.startswith("fb-")


class TestListForProject:
    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_returns_all_when_no_filter(self, _mock_notif):
        svc = FeedbackService()
        svc.submit(FeedbackSubmitRequest(project_id="a", title="T1", body="B1"))
        svc.submit(FeedbackSubmitRequest(project_id="b", title="T2", body="B2"))
        items = svc.list_for_project(None)
        assert len(items) == 2

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_filters_by_project(self, _mock_notif):
        svc = FeedbackService()
        svc.submit(FeedbackSubmitRequest(project_id="a", title="T1", body="B1"))
        svc.submit(FeedbackSubmitRequest(project_id="b", title="T2", body="B2"))
        svc.submit(FeedbackSubmitRequest(project_id="a", title="T3", body="B3"))
        items = svc.list_for_project("a")
        assert len(items) == 2
        assert all(i.project_id == "a" for i in items)

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_max_limit_100(self, _mock_notif):
        svc = FeedbackService()
        for i in range(110):
            svc.submit(
                FeedbackSubmitRequest(
                    project_id="x", title=f"Item {i}", body="body"
                )
            )
        items = svc.list_for_project(None)
        assert len(items) == 100


class TestIngestWebhook:
    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_intercom_provider(self, _mock_notif):
        svc = FeedbackService()
        payload = FeedbackWebhookPayload(
            external_id="ext-1",
            title="Intercom ticket",
            body="User needs help",
            project_id="proj-2",
        )
        resp = svc.ingest_webhook(payload, provider="intercom")
        assert resp.status == "received"
        assert resp.title == "Intercom ticket"
        stored = feedback_module._FEEDBACK_STORE[0]
        assert stored["source"] == "intercom"

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_canny_provider(self, _mock_notif):
        svc = FeedbackService()
        payload = FeedbackWebhookPayload(
            external_id="ext-2",
            title="Canny request",
            body="Feature idea",
            project_id="proj-3",
        )
        resp = svc.ingest_webhook(payload, provider="canny")
        assert resp.status == "received"
        stored = feedback_module._FEEDBACK_STORE[0]
        assert stored["source"] == "other"

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_missing_title_falls_back(self, _mock_notif):
        svc = FeedbackService()
        payload = FeedbackWebhookPayload(
            external_id="ext-3", title="", body="", project_id="proj-4"
        )
        resp = svc.ingest_webhook(payload, provider="zendesk")
        assert "Inbound from zendesk" in resp.title

    @patch.object(FeedbackService, "_schedule_feedback_notification")
    def test_title_truncated_to_200(self, _mock_notif):
        svc = FeedbackService()
        payload = FeedbackWebhookPayload(
            external_id="ext-4",
            title="A" * 300,
            body="body",
            project_id="proj-5",
        )
        resp = svc.ingest_webhook(payload, provider="intercom")
        assert len(resp.title) <= 200
