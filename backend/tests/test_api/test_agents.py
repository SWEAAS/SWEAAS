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


def test_customer_support_agent(client):
    resp = client.get("/api/v1/agents/sup-cs-01")
    assert resp.status_code == 200
    data = resp.json()
    assert data["department"] == "support"
    assert data["role"] == "customer_support"


def test_agent_chat(client):
    """Test POST /agents/{id}/chat with mocked LLM."""
    from unittest.mock import AsyncMock, patch
    from app.schemas.agent_schema import AgentChatResponse

    mock_response = AgentChatResponse(
        agent_id="cto-01", response="I recommend prioritizing the auth module.", context_injected=False,
    )

    with patch("app.services.agent_service.AgentService.chat", new_callable=AsyncMock, return_value=mock_response):
        resp = client.post(
            "/api/v1/agents/cto-01/chat",
            json={"message": "What should we work on next?"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == "cto-01"
        assert "recommend" in data["response"].lower()


def test_agent_chat_not_found(client):
    resp = client.post(
        "/api/v1/agents/nonexistent/chat",
        json={"message": "Hello"},
    )
    assert resp.status_code == 404


def test_agent_chat_empty_message(client):
    resp = client.post(
        "/api/v1/agents/cto-01/chat",
        json={"message": ""},
    )
    assert resp.status_code == 422


def test_agent_chat_with_history(client):
    from unittest.mock import AsyncMock, patch
    from app.schemas.agent_schema import AgentChatResponse

    mock_response = AgentChatResponse(
        agent_id="eng-mgr-01", response="Sure, let me review the PRs.", context_injected=False,
    )
    with patch("app.services.agent_service.AgentService.chat", new_callable=AsyncMock, return_value=mock_response):
        resp = client.post(
            "/api/v1/agents/eng-mgr-01/chat",
            json={
                "message": "Can you review the latest PRs?",
                "history": [
                    {"role": "user", "content": "Hi"},
                    {"role": "assistant", "content": "Hello! How can I help?"},
                ],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["agent_id"] == "eng-mgr-01"
