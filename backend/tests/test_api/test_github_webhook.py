"""GitHub webhook endpoint tests."""

import hashlib
import hmac
import json
import os
from unittest.mock import patch

import pytest
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def _clear_webhook_secret(monkeypatch):
    """Ensure GITHUB_WEBHOOK_SECRET is empty so signature check is skipped."""
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", "")
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_webhook_ping(client):
    resp = client.post(
        "/api/v1/github/webhook",
        json={"zen": "Keep it logically awesome."},
        headers={"X-GitHub-Event": "ping"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pong"
    assert data["zen"] == "Keep it logically awesome."


def test_webhook_push(client):
    resp = client.post(
        "/api/v1/github/webhook",
        json={
            "ref": "refs/heads/main",
            "pusher": {"name": "testuser"},
            "commits": [{"id": "abc123"}],
            "repository": {"full_name": "SWEAAS/test-repo"},
        },
        headers={"X-GitHub-Event": "push"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "received"
    assert data["event"] == "push"
    assert data["branch"] == "main"


def test_webhook_pull_request(client):
    resp = client.post(
        "/api/v1/github/webhook",
        json={
            "action": "opened",
            "number": 42,
            "pull_request": {"title": "Add feature X"},
            "repository": {"full_name": "SWEAAS/test-repo"},
        },
        headers={"X-GitHub-Event": "pull_request"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "received"
    assert data["pr"] == 42
    assert data["action"] == "opened"


def test_webhook_unknown_event(client):
    resp = client.post(
        "/api/v1/github/webhook",
        json={"data": "test"},
        headers={"X-GitHub-Event": "deployment"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"


def test_webhook_no_event_header(client):
    resp = client.post(
        "/api/v1/github/webhook",
        json={"data": "test"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"


def test_webhook_invalid_json(client):
    resp = client.post(
        "/api/v1/github/webhook",
        content=b"not json",
        headers={"Content-Type": "application/json", "X-GitHub-Event": "push"},
    )
    assert resp.status_code == 400


def test_webhook_signature_verification():
    """Test HMAC verification when secret is configured."""
    secret = "test-secret-123"
    payload = json.dumps({"zen": "Test"}).encode()
    sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()

    with patch("app.api.routes.github_router.get_settings") as mock_settings:
        settings = mock_settings.return_value
        settings.github_webhook_secret = secret

        from app.api.routes.github_router import _verify_signature
        _verify_signature(payload, sig)


def test_webhook_signature_mismatch():
    """Test HMAC verification fails with wrong signature."""
    secret = "test-secret-123"
    payload = b'{"zen": "Test"}'

    with patch("app.api.routes.github_router.get_settings") as mock_settings:
        settings = mock_settings.return_value
        settings.github_webhook_secret = secret

        from app.api.routes.github_router import _verify_signature
        with pytest.raises(HTTPException) as exc_info:
            _verify_signature(payload, "sha256=invalid")
        assert exc_info.value.status_code == 401


def test_webhook_missing_signature():
    """Test HMAC verification fails with missing signature header."""
    with patch("app.api.routes.github_router.get_settings") as mock_settings:
        settings = mock_settings.return_value
        settings.github_webhook_secret = "real-secret"

        from app.api.routes.github_router import _verify_signature
        with pytest.raises(HTTPException) as exc_info:
            _verify_signature(b"body", None)
        assert exc_info.value.status_code == 401
