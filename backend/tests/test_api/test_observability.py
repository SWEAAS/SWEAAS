"""Observability endpoint tests."""


def test_overview(client):
    resp = client.get("/api/v1/observability/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_active_agents" in data
    assert "departments" in data
    assert isinstance(data["departments"], list)


def test_reports(client):
    resp = client.get("/api/v1/observability/reports")
    assert resp.status_code == 200
    data = resp.json()
    assert "reports" in data
    assert isinstance(data["reports"], list)
