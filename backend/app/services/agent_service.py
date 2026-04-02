"""Domain logic for agent directory, status, and chat relay."""

from app.schemas.agent_schema import (
    AgentActivity,
    AgentChatRequest,
    AgentChatResponse,
    AgentDetail,
    AgentSummary,
)
from app.services.seed_data import AGENTS

# Stable ID for the product-facing support agent (chat with end users).
CUSTOMER_SUPPORT_AGENT_ID = "sup-cs-01"


class AgentService:
    """Provides agent directory, activity data, and chat relay.

    **Product-user chat:** use ``POST /api/v1/agents/sup-cs-01/chat`` (Customer Support)
    from your product UI so end-user conversations stay separate from internal
    engineering agents. **Customer video calls:** ``POST /api/v1/communication/customer-call``.

    In production, agent queries will hit the database; chat messages
    will be relayed to the LangGraph orchestration service.
    """

    def list_agents(self) -> list[AgentSummary]:
        return [AgentSummary(**self._to_summary(agent)) for agent in AGENTS]

    def get_agent(self, agent_id: str) -> AgentDetail | None:
        agent = self._get_agent_record(agent_id)
        if agent is None:
            return None
        return AgentDetail(**agent)

    def list_activity(self, agent_id: str) -> list[AgentActivity]:
        agent = self._get_agent_record(agent_id)
        if agent is None:
            return []
        return [AgentActivity(**activity) for activity in agent["recent_activity"]]

    async def chat(self, agent_id: str, request: AgentChatRequest) -> AgentChatResponse:
        """Relay a user message to an agent and return its response.

        This will be wired to the LangGraph orchestration service so that
        the user's message is injected as context for the agent's next task.
        """
        return AgentChatResponse(
            agent_id=agent_id,
            response=f"[{agent_id}] Acknowledged: {request.message[:100]}",
            context_injected=True,
        )

    def _get_agent_record(self, agent_id: str) -> dict | None:
        return next((agent for agent in AGENTS if agent["agent_id"] == agent_id), None)

    def _to_summary(self, agent: dict) -> dict:
        return {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "role": agent.get("role", "specialist"),
            "department": agent["department"],
            "hierarchy_level": agent.get("hierarchy_level", "specialist"),
            "status": agent["status"],
            "daily_token_budget": agent["daily_token_budget"],
            "tokens_used_today": agent["tokens_used_today"],
            "current_focus": agent.get("current_focus", ""),
        }
