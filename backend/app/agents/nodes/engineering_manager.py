"""Engineering Manager — orchestrates specialist engineering agents.

Receives engineering subtasks from the CTO, further decomposes them into
specific assignments for frontend, backend, devops, and QA specialists.
"""

import json
import logging

from app.agents.state import AgentState

logger = logging.getLogger(__name__)

ENG_MGR_PROMPT = """You are the Engineering Manager. Your role is to:

1. RECEIVE engineering tasks from the CTO
2. DECOMPOSE them into specific assignments for your team:
   - frontend_dev: UI components, React code, styling
   - backend_architect: API endpoints, database, services
   - devops: CI/CD, infrastructure, deployment
   - qa_tester: tests, code quality, regression checks
3. ASSIGN each subtask to the right specialist
4. REVIEW results from specialists and report back to CTO

Respond with JSON:
{
  "assignments": [
    {"specialist": "frontend_dev|backend_architect|devops|qa_tester", "task": "description", "priority": "high|medium|low"}
  ],
  "status": "assigned"
}"""


async def engineering_manager_node(state: AgentState) -> dict:
    """Engineering Manager node — assigns tasks to engineering specialists."""
    subtasks = state.get("subtasks", [])
    eng_tasks = [s for s in subtasks if s.get("department") == "engineering"]

    if not eng_tasks:
        return {
            "current_agent": "engineering_manager",
            "messages": [{"role": "engineering_manager", "content": "No engineering tasks to process."}],
        }

    logger.info("Engineering Manager processing %d tasks", len(eng_tasks))

    try:
        from app.core.config import get_settings

        settings = get_settings()
        if settings.openai_api_key or settings.anthropic_api_key:
            import litellm

            tasks_text = "\n".join(f"- {t['description']}" for t in eng_tasks)
            response = litellm.completion(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": ENG_MGR_PROMPT},
                    {"role": "user", "content": f"Engineering tasks:\n{tasks_text}"},
                ],
                api_key=settings.openai_api_key or None,
            )
            content = response.choices[0].message.content
            return {
                "current_agent": "engineering_manager",
                "messages": [{"role": "engineering_manager", "content": content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for eng manager: %s", exc)

    assignments = []
    for task in eng_tasks:
        desc = task["description"].lower()
        if any(kw in desc for kw in ["ui", "frontend", "react", "component", "css"]):
            assignments.append({"specialist": "frontend_dev", "task": task["description"], "priority": task.get("priority", "medium")})
        elif any(kw in desc for kw in ["deploy", "ci", "docker", "infra", "pipeline"]):
            assignments.append({"specialist": "devops", "task": task["description"], "priority": task.get("priority", "medium")})
        elif any(kw in desc for kw in ["test", "qa", "quality", "regression"]):
            assignments.append({"specialist": "qa_tester", "task": task["description"], "priority": task.get("priority", "medium")})
        else:
            assignments.append({"specialist": "backend_architect", "task": task["description"], "priority": task.get("priority", "medium")})

    return {
        "current_agent": "engineering_manager",
        "messages": [{"role": "engineering_manager", "content": json.dumps({"assignments": assignments})}],
        "status": "assigned",
    }
