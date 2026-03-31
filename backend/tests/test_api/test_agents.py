"""Agent endpoint tests."""


def test_list_agents(client):
    resp = client.get("/api/v1/agents")
    assert resp.status_code == 200
    agents = resp.json()
    assert isinstance(agents, list)
    assert len(agents) > 0
    first = agents[0]
    assert "agent_id" in first
    assert "name" in first
    assert "status" in first
    assert "department" in first


def test_get_agent(client):
    resp = client.get("/api/v1/agents/cto-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_id"] == "cto-01"
    assert data["name"] == "CTO Agent"
    assert data["hierarchy_level"] == "cto"


def test_get_agent_not_found(client):
    resp = client.get("/api/v1/agents/nonexistent")
    assert resp.status_code == 404


def test_agent_activity(client):
    resp = client.get("/api/v1/agents/cto-01/activity")
    assert resp.status_code == 200
    activities = resp.json()
    assert isinstance(activities, list)
