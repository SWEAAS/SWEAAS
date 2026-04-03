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


def test_feedback_webhook_canny(client):
    resp = client.post(
        "/api/v1/feedback/webhooks/canny",
        json={"title": "Feature from Canny", "body": "Users want dark mode", "project_id": "p1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Feature from Canny"
    assert data["feedback_id"].startswith("fb-")


def test_feedback_webhook_canny_empty_fields(client):
    resp = client.post(
        "/api/v1/feedback/webhooks/canny",
        json={},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["feedback_id"].startswith("fb-")


def test_feedback_list_with_project_filter(client):
    client.post(
        "/api/v1/feedback",
        json={"title": "Bug A", "body": "Details", "category": "bug", "source": "in_app", "project_id": "proj-x"},
    )
    resp = client.get("/api/v1/feedback?project_id=proj-x")
    assert resp.status_code == 200


def test_feedback_submit_all_fields(client):
    resp = client.post(
        "/api/v1/feedback",
        json={
            "title": "Full feedback",
            "body": "With all fields set",
            "category": "ux",
            "source": "email",
            "project_id": "proj-1",
            "user_email": "user@example.com",
            "priority": "high",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Full feedback"
