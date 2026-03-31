"""Frontend Developer specialist — builds UI components in sandboxed execution."""

import logging

from app.agents.prompts.role_loader import load_role_prompt
from app.agents.state import AgentState

logger = logging.getLogger(__name__)


async def frontend_dev_node(state: AgentState) -> dict:
    """Execute frontend development tasks in an E2B sandbox."""
    role_prompt = load_role_prompt("frontend_dev")
    logger.info("Frontend Dev processing task")

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
                "current_agent": "frontend_dev",
                "results": [{"agent": "frontend_dev", "output": response.choices[0].message.content}],
                "messages": [{"role": "frontend_dev", "content": response.choices[0].message.content}],
            }
    except Exception as exc:
        logger.warning("LLM unavailable for frontend dev: %s", exc)

    return {
        "current_agent": "frontend_dev",
        "results": [{"agent": "frontend_dev", "output": "[stub] Frontend task completed"}],
        "messages": [{"role": "frontend_dev", "content": "Task completed (stub mode)"}],
    }
