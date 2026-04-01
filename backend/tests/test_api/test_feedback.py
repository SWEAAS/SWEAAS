"""Feedback API tests.

With ``AUTH_ENFORCE_JWT=false`` (default in tests), auth middleware runs in dev mode
and accepts requests without a Bearer token.
"""


def test_feedback_submit_dev_mode(client):
    resp = client.post(
        "/api/v1/feedback",
        json={
            "title": "Love the dashboard",
            "body": "Would like dark mode.",
            "category": "feature",
            "source": "in_app",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Love the dashboard"


def test_feedback_list(client):
    client.post(
        "/api/v1/feedback",
        json={"title": "A", "body": "B", "category": "bug", "source": "api"},
    )
    resp = client.get("/api/v1/feedback")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1


def test_feedback_webhook_intercom_public(client):
    resp = client.post(
        "/api/v1/feedback/webhooks/intercom",
        json={"title": "Ticket from Intercom", "body": "User cannot login", "project_id": "p1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Ticket from Intercom"
    assert data["feedback_id"].startswith("fb-")
