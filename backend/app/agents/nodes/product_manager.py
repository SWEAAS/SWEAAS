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
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            tasks_text = "\n".join(f"- {t['description']}" for t in prod_tasks)
            result = await llm_completion(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are the Product Manager. Analyze product tasks, "
                            "create actionable items for product operations, and "
                            "respond with a JSON plan with 'assignments' array."
                        ),
                    },
                    {"role": "user", "content": f"Product tasks:\n{tasks_text}"},
                ],
                agent_id="prd-mgr-01",
            )
            assignments = _parse_prod_assignments(result.content, prod_tasks)
            return {
                "current_agent": "product_manager",
                "assignments": assignments,
                "messages": [{"role": "product_manager", "content": result.content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for product manager: %s", exc)

    assignments = [
        {
            "specialist": "product_ops",
            "task": t["description"],
            "priority": t.get("priority", "medium"),
        }
        for t in prod_tasks
    ]
    payload = json.dumps({"assignments": assignments})
    return {
        "current_agent": "product_manager",
        "assignments": assignments,
        "messages": [{"role": "product_manager", "content": payload}],
        "status": "assigned",
    }


def _parse_prod_assignments(llm_content: str, fallback_tasks: list[dict]) -> list[dict]:
    """Try to parse structured assignments from LLM JSON response."""
    try:
        parsed = json.loads(llm_content)
        if "assignments" in parsed and isinstance(parsed["assignments"], list):
            return parsed["assignments"]
    except (json.JSONDecodeError, TypeError):
        pass
    return [
        {"specialist": "product_ops", "task": t["description"], "priority": t.get("priority", "medium")}
        for t in fallback_tasks
    ]
