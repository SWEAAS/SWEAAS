"""Unit tests for AgentService."""

import asyncio
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from app.core.llm import LLMResult
from app.schemas.agent_schema import AgentChatRequest, ChatMessage
from app.services.agent_service import AgentService
from app.services.seed_data import AGENTS


class TestListAgents:
    def test_returns_all_seed_agents(self):
        svc = AgentService()
        agents = svc.list_agents()
        assert len(agents) == len(AGENTS)

    def test_summary_fields_populated(self):
        svc = AgentService()
        agents = svc.list_agents()
        first = agents[0]
        assert first.agent_id == "cto-01"
        assert first.name == "CTO Agent"
        assert first.department == "engineering"
        assert first.status == "active"
        assert first.daily_token_budget == 200_000

    def test_all_agents_have_required_fields(self):
        svc = AgentService()
        for agent in svc.list_agents():
            assert agent.agent_id
            assert agent.name
            assert agent.department in ("engineering", "marketing", "product", "support")


class TestGetAgent:
    def test_found(self):
        svc = AgentService()
        detail = svc.get_agent("cto-01")
        assert detail is not None
        assert detail.agent_id == "cto-01"
        assert detail.name == "CTO Agent"
        assert detail.description
        assert isinstance(detail.recent_activity, list)

    def test_not_found(self):
        svc = AgentService()
        assert svc.get_agent("nonexistent-agent") is None

    def test_returns_agent_detail_with_extra_fields(self):
        svc = AgentService()
        detail = svc.get_agent("eng-fe-01")
        assert detail is not None
        assert detail.email == "frontend.dev@sweaas.dev"
        assert detail.location == "Austin, TX"
        assert detail.timezone == "America/Chicago"


class TestListActivity:
    def test_agent_with_activities(self):
        svc = AgentService()
        activities = svc.list_activity("cto-01")
        assert len(activities) == 1
        assert activities[0].activity_id == "act-c001"
        assert activities[0].state == "completed"

    def test_agent_with_no_activities(self):
        svc = AgentService()
        activities = svc.list_activity("eng-devops-01")
        assert activities == []

    def test_nonexistent_agent_returns_empty(self):
        svc = AgentService()
        assert svc.list_activity("no-such-agent") == []


class TestChat:
    @patch("app.services.agent_service.llm_completion", new_callable=AsyncMock)
    @patch("app.services.agent_service.llm_has_credentials", return_value=True)
    def test_successful_llm_response(self, _mock_creds, mock_llm):
        mock_llm.return_value = LLMResult(content="Hello from the CTO!")
        svc = AgentService()
        req = AgentChatRequest(message="What are you working on?")
        resp = asyncio.run(svc.chat("cto-01", req))
        assert resp.agent_id == "cto-01"
        assert resp.response == "Hello from the CTO!"
        assert resp.context_injected is True
        mock_llm.assert_awaited_once()

    @patch("app.services.agent_service.llm_has_credentials", return_value=False)
    def test_fallback_when_no_credentials(self, _mock_creds):
        svc = AgentService()
        req = AgentChatRequest(message="Hello there")
        resp = asyncio.run(svc.chat("cto-01", req))
        assert resp.agent_id == "cto-01"
        assert "Acknowledged" in resp.response
        assert resp.context_injected is False

    def test_fallback_for_unknown_agent(self):
        svc = AgentService()
        req = AgentChatRequest(message="Hello")
        resp = asyncio.run(svc.chat("no-agent-99", req))
        assert resp.agent_id == "no-agent-99"
        assert resp.context_injected is False

    @patch("app.services.agent_service.llm_completion", new_callable=AsyncMock)
    @patch("app.services.agent_service.llm_has_credentials", return_value=True)
    def test_chat_with_history(self, _mock_creds, mock_llm):
        mock_llm.return_value = LLMResult(content="Follow-up answer")
        svc = AgentService()
        req = AgentChatRequest(
            message="And then?",
            history=[
                ChatMessage(role="user", content="First question"),
                ChatMessage(role="assistant", content="First answer"),
            ],
        )
        resp = asyncio.run(svc.chat("eng-be-01", req))
        assert resp.response == "Follow-up answer"
        call_kwargs = mock_llm.call_args[1]
        messages = call_kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "First question"
        assert messages[-1]["role"] == "user"
        assert messages[-1]["content"] == "And then?"

    @patch(
        "app.services.agent_service.llm_completion",
        new_callable=AsyncMock,
        side_effect=Exception("LLM down"),
    )
    @patch("app.services.agent_service.llm_has_credentials", return_value=True)
    def test_llm_exception_returns_fallback(self, _mock_creds, _mock_llm):
        svc = AgentService()
        req = AgentChatRequest(message="Trigger failure")
        resp = asyncio.run(svc.chat("cto-01", req))
        assert "temporarily unavailable" in resp.response.lower()
        assert resp.context_injected is False
