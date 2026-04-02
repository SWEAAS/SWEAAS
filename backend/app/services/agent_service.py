"""Domain logic for agent directory, status, and chat relay."""

import logging

from app.core.llm import llm_completion, llm_has_credentials
from app.schemas.agent_schema import (
    AgentActivity,
    AgentChatRequest,
    AgentChatResponse,
    AgentDetail,
    AgentSummary,
)
from app.services.seed_data import AGENTS

logger = logging.getLogger(__name__)

# Stable ID for the product-facing support agent (chat with end users).
CUSTOMER_SUPPORT_AGENT_ID = "sup-cs-01"

_DEPT_CONTEXT = {
    "engineering": (
        "You are a software engineer at SWEAAS, an AI-powered SWE-as-a-service platform. "
        "You write and review code, manage GitHub repos, fix bugs caught by Sentry, and "
        "collaborate with product and marketing teams. Keep answers concise and technical."
    ),
    "marketing": (
        "You are a marketing professional at SWEAAS. You run growth campaigns, analyse "
        "metrics, produce copy, and coordinate with the product team on launches. "
        "Keep answers strategic and action-oriented."
    ),
    "product": (
        "You are a product manager at SWEAAS. You own the roadmap, gather user feedback, "
        "write specs, and bridge engineering and business stakeholders. "
        "Keep answers crisp and outcome-focused."
    ),
    "support": (
        "You are a customer success specialist at SWEAAS. You help end users resolve issues, "
        "collect feedback, and escalate product bugs. Keep answers empathetic and clear."
    ),
}


def _build_system_prompt(agent: dict) -> str:
    dept_ctx = _DEPT_CONTEXT.get(agent["department"], "")
    focus = agent.get("current_focus", "")
    return (
        f"You are {agent['name']}, a {agent['role'].replace('_', ' ')} at SWEAAS. "
        f"{dept_ctx}\n\n"
        f"Your current focus: {focus}\n\n"
        "Respond in first person as this agent. Be helpful, concise, and stay in character. "
        "You can discuss what you are working on, give technical opinions, and accept "
        "guidance about your next task."
    )


class AgentService:
    """Provides agent directory, activity data, and chat relay."""

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
        """Send a message to an agent and get a real LLM response.

        Uses the configured LLM (default: xAI Grok) with the agent's persona
        as the system prompt. Budget is tracked automatically via the budget tracker.
        Falls back to a stub acknowledgement when no LLM credentials are configured.
        """
        agent = self._get_agent_record(agent_id)
        if agent is None or not llm_has_credentials():
            return AgentChatResponse(
                agent_id=agent_id,
                response=f"[{agent_id}] Acknowledged: {request.message[:100]}",
                context_injected=False,
            )

        system_prompt = _build_system_prompt(agent)
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

        for h in request.history:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": request.message})

        try:
            result = await llm_completion(messages=messages, agent_id=agent_id)
            return AgentChatResponse(
                agent_id=agent_id,
                response=result.content,
                context_injected=True,
            )
        except Exception:
            logger.exception("LLM chat failed for agent %s", agent_id)
            return AgentChatResponse(
                agent_id=agent_id,
                response="I'm temporarily unavailable. Please try again in a moment.",
                context_injected=False,
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
