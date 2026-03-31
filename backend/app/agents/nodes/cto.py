"""CTO Agent — top-level supervisor that decomposes tasks and delegates to managers.

The CTO never writes code. It receives user/system tasks, breaks them into
department-level subtasks, and routes them to the appropriate manager nodes.
"""

import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import AgentState

logger = logging.getLogger(__name__)

CTO_SYSTEM_PROMPT = """You are the CTO of a software engineering company. Your role is to:

1. ANALYZE incoming tasks and break them into department-level subtasks
2. DELEGATE each subtask to the appropriate department manager:
   - engineering: code changes, bug fixes, infrastructure, testing
   - product: roadmap, feature prioritization, user research
   - marketing: growth, campaigns, analytics
3. NEVER write code yourself — only decompose and delegate
4. MONITOR budget constraints and enforce token limits

Respond with a JSON object containing:
{
  "analysis": "Brief analysis of the task",
  "subtasks": [
    {"department": "engineering|product|marketing", "description": "What to do", "priority": "high|medium|low"}
  ],
  "status": "delegated"
}"""


async def cto_node(state: AgentState) -> dict:
    """CTO supervisor node — decomposes tasks and creates subtasks for managers."""
    task = state.get("task", "")
    logger.info("CTO processing task: %s", task[:80])

    try:
        from app.core.config import get_settings

        settings = get_settings()
        if settings.openai_api_key or settings.anthropic_api_key:
            import litellm

            response = litellm.completion(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": CTO_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Task: {task}"},
                ],
                api_key=settings.openai_api_key or None,
            )
            content = response.choices[0].message.content
            try:
                parsed = json.loads(content)
                return {
                    "subtasks": parsed.get("subtasks", []),
                    "status": "delegated",
                    "current_agent": "cto",
                    "messages": [{"role": "cto", "content": content}],
                }
            except json.JSONDecodeError:
                return {
                    "subtasks": [{"department": "engineering", "description": task, "priority": "medium"}],
                    "status": "delegated",
                    "current_agent": "cto",
                    "messages": [{"role": "cto", "content": content}],
                }
    except Exception as exc:
        logger.warning("LLM unavailable, using rule-based decomposition: %s", exc)

    # Fallback: rule-based task decomposition
    subtasks = _rule_based_decompose(task)
    return {
        "subtasks": subtasks,
        "status": "delegated",
        "current_agent": "cto",
        "messages": [{"role": "cto", "content": f"Decomposed into {len(subtasks)} subtasks"}],
    }


def _rule_based_decompose(task: str) -> list[dict]:
    """Simple keyword-based task routing when LLM is unavailable."""
    task_lower = task.lower()
    subtasks = []

    engineering_keywords = ["code", "bug", "fix", "implement", "api", "test", "deploy", "build", "refactor"]
    product_keywords = ["feature", "roadmap", "user", "research", "prioritize", "product"]
    marketing_keywords = ["campaign", "growth", "marketing", "analytics", "content"]

    if any(kw in task_lower for kw in engineering_keywords):
        subtasks.append({"department": "engineering", "description": task, "priority": "high"})
    if any(kw in task_lower for kw in product_keywords):
        subtasks.append({"department": "product", "description": task, "priority": "medium"})
    if any(kw in task_lower for kw in marketing_keywords):
        subtasks.append({"department": "marketing", "description": task, "priority": "medium"})

    if not subtasks:
        subtasks.append({"department": "engineering", "description": task, "priority": "medium"})

    return subtasks
