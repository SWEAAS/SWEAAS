"""Backend Architect specialist — designs and implements API/service code."""

import logging

from app.agents.prompts.role_loader import load_role_prompt
from app.agents.state import AgentState

logger = logging.getLogger(__name__)


async def backend_architect_node(state: AgentState) -> dict:
    """Execute backend architecture tasks."""
    role_prompt = load_role_prompt("backend_architect")
    logger.info("Backend Architect processing task")

    try:
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            task = state.get("task", "")
            result = await llm_completion(
                messages=[
                    {"role": "system", "content": role_prompt[:4000]},
                    {"role": "user", "content": f"Implement: {task}"},
                ],
                agent_id="eng-be-01",
            )
            return {
                "current_agent": "backend_architect",
                "results": [{"agent": "backend_architect", "output": result.content}],
                "messages": [{"role": "backend_architect", "content": result.content}],
            }
    except Exception as exc:
        logger.warning("LLM unavailable for backend architect: %s", exc)

    return {
        "current_agent": "backend_architect",
        "results": [{"agent": "backend_architect", "output": "[stub] Backend task completed"}],
        "messages": [{"role": "backend_architect", "content": "Task completed (stub mode)"}],
    }
