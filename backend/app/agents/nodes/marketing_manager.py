"""Marketing Manager — orchestrates marketing specialist agents."""

import json
import logging

from app.agents.state import AgentState

logger = logging.getLogger(__name__)


async def marketing_manager_node(state: AgentState) -> dict:
    """Marketing Manager node — handles marketing-related subtasks."""
    subtasks = state.get("subtasks", [])
    mkt_tasks = [s for s in subtasks if s.get("department") == "marketing"]

    if not mkt_tasks:
        return {
            "current_agent": "marketing_manager",
            "messages": [{"role": "marketing_manager", "content": "No marketing tasks to process."}],
        }

    logger.info("Marketing Manager processing %d tasks", len(mkt_tasks))

    try:
        from app.core.config import get_settings

        settings = get_settings()
        if settings.openai_api_key or settings.anthropic_api_key:
            import litellm

            tasks_text = "\n".join(f"- {t['description']}" for t in mkt_tasks)
            response = litellm.completion(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are the Marketing Manager. Analyze marketing tasks, "
                            "create actionable items for growth analysts, and "
                            "respond with a JSON plan."
                        ),
                    },
                    {"role": "user", "content": f"Marketing tasks:\n{tasks_text}"},
                ],
                api_key=settings.openai_api_key or None,
            )
            return {
                "current_agent": "marketing_manager",
                "messages": [{"role": "marketing_manager", "content": response.choices[0].message.content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for marketing manager: %s", exc)

    assignments = [
        {"specialist": "growth_analyst", "task": t["description"], "priority": t.get("priority", "medium")}
        for t in mkt_tasks
    ]
    return {
        "current_agent": "marketing_manager",
        "messages": [{"role": "marketing_manager", "content": json.dumps({"assignments": assignments})}],
        "status": "assigned",
    }
