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
        empty_msg = "No marketing tasks to process."
        return {
            "current_agent": "marketing_manager",
            "messages": [{"role": "marketing_manager", "content": empty_msg}],
        }

    logger.info("Marketing Manager processing %d tasks", len(mkt_tasks))

    try:
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            tasks_text = "\n".join(f"- {t['description']}" for t in mkt_tasks)
            result = await llm_completion(
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
                agent_id="mkt-mgr-01",
            )
            return {
                "current_agent": "marketing_manager",
                "messages": [{"role": "marketing_manager", "content": result.content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for marketing manager: %s", exc)

    assignments = [
        {
            "specialist": "growth_analyst",
            "task": t["description"],
            "priority": t.get("priority", "medium"),
        }
        for t in mkt_tasks
    ]
    payload = json.dumps({"assignments": assignments})
    return {
        "current_agent": "marketing_manager",
        "messages": [{"role": "marketing_manager", "content": payload}],
        "status": "assigned",
    }
