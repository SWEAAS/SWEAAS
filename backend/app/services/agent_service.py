"""Domain logic for agent endpoints."""

from app.schemas.agent_schema import AgentActivity, AgentDetail, AgentSummary
from app.services.seed_data import AGENTS


class AgentService:
    """Provides agent directory and activity data."""

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

    def _get_agent_record(self, agent_id: str) -> dict | None:
        return next((agent for agent in AGENTS if agent["agent_id"] == agent_id), None)

    def _to_summary(self, agent: dict) -> dict:
        return {
            "agent_id": agent["agent_id"],
            "name": agent["name"],
            "department": agent["department"],
            "status": agent["status"],
            "owner_email": agent["owner_email"],
            "daily_token_budget": agent["daily_token_budget"],
            "tokens_used_today": agent["tokens_used_today"],
        }
