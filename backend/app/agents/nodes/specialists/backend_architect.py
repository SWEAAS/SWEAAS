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
        from app.core.config import get_settings

        settings = get_settings()
        if settings.openai_api_key or settings.anthropic_api_key:
            import litellm

            task = state.get("task", "")
            response = litellm.completion(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": role_prompt[:4000]},
                    {"role": "user", "content": f"Implement: {task}"},
                ],
                api_key=settings.openai_api_key or None,
            )
            return {
                "current_agent": "backend_architect",
                "results": [{"agent": "backend_architect", "output": response.choices[0].message.content}],
                "messages": [{"role": "backend_architect", "content": response.choices[0].message.content}],
            }
    except Exception as exc:
        logger.warning("LLM unavailable for backend architect: %s", exc)

    return {
        "current_agent": "backend_architect",
        "results": [{"agent": "backend_architect", "output": "[stub] Backend task completed"}],
        "messages": [{"role": "backend_architect", "content": "Task completed (stub mode)"}],
    }
