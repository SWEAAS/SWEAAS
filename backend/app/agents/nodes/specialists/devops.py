"""DevOps Automator specialist — manages infrastructure and CI/CD with tool access."""

import logging

from app.agents.prompts.role_loader import load_role_prompt
from app.agents.state import AgentState
from app.agents.tools import get_tools_for_role

logger = logging.getLogger(__name__)

ROLE_SLUG = "devops"
AGENT_ID = "eng-do-01"


def _get_task(state: AgentState) -> str:
    for a in state.get("assignments", []):
        if a.get("specialist") == ROLE_SLUG:
            return a.get("task", state.get("task", ""))
    return state.get("task", "")


async def devops_node(state: AgentState) -> dict:
    """Execute DevOps/infrastructure tasks with tool access."""
    role_prompt = load_role_prompt(ROLE_SLUG)
    task = _get_task(state)
    logger.info("DevOps agent processing task")

    try:
        from app.core.llm import llm_has_credentials, run_agent_with_tools

        if llm_has_credentials():
            tools = get_tools_for_role(ROLE_SLUG)
            result = await run_agent_with_tools(
                system_prompt=role_prompt[:4000],
                user_message=f"Implement: {task}",
                tools=tools,
                agent_id=AGENT_ID,
            )
            return {
                "current_agent": ROLE_SLUG,
                "results": [{"agent": ROLE_SLUG, "output": result.content}],
                "messages": [{"role": ROLE_SLUG, "content": result.content}],
                "budget_remaining": max(
                    0, state.get("budget_remaining", 100_000) - result.total_tokens
                ),
            }
    except Exception as exc:
        logger.warning("DevOps failed: %s", exc)
        return {
            "current_agent": ROLE_SLUG,
            "results": [{"agent": ROLE_SLUG, "output": f"[error] {exc}"}],
            "messages": [{"role": ROLE_SLUG, "content": f"Error: {exc}"}],
        }

    return {
        "current_agent": ROLE_SLUG,
        "results": [{"agent": ROLE_SLUG, "output": "[stub] DevOps task completed"}],
        "messages": [{"role": ROLE_SLUG, "content": "Task completed (stub mode)"}],
    }
