"""Product Manager — orchestrates product operations specialists."""

import json
import logging

from app.agents.state import AgentState

logger = logging.getLogger(__name__)


async def product_manager_node(state: AgentState) -> dict:
    """Product Manager node — handles product-related subtasks."""
    subtasks = state.get("subtasks", [])
    prod_tasks = [s for s in subtasks if s.get("department") == "product"]

    if not prod_tasks:
        return {
            "current_agent": "product_manager",
            "messages": [{"role": "product_manager", "content": "No product tasks to process."}],
        }

    logger.info("Product Manager processing %d tasks", len(prod_tasks))

    try:
        from app.core.config import get_settings

        settings = get_settings()
        if settings.openai_api_key or settings.anthropic_api_key:
            import litellm

            tasks_text = "\n".join(f"- {t['description']}" for t in prod_tasks)
            response = litellm.completion(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are the Product Manager. Analyze product tasks, "
                            "create actionable items for product operations, and "
                            "respond with a JSON plan."
                        ),
                    },
                    {"role": "user", "content": f"Product tasks:\n{tasks_text}"},
                ],
                api_key=settings.openai_api_key or None,
            )
            return {
                "current_agent": "product_manager",
                "messages": [{"role": "product_manager", "content": response.choices[0].message.content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for product manager: %s", exc)

    assignments = [
        {"specialist": "product_ops", "task": t["description"], "priority": t.get("priority", "medium")}
        for t in prod_tasks
    ]
    return {
        "current_agent": "product_manager",
        "messages": [{"role": "product_manager", "content": json.dumps({"assignments": assignments})}],
        "status": "assigned",
    }
