"""Engineering Manager — orchestrates specialist engineering agents.

Receives engineering subtasks from the CTO, further decomposes them into
specific assignments for frontend, backend, devops, and QA specialists.
"""

import json
import logging

from app.agents.state import AgentState

logger = logging.getLogger(__name__)


def _eng_task_row(specialist: str, task: dict) -> dict:
    return {
        "specialist": specialist,
        "task": task["description"],
        "priority": task.get("priority", "medium"),
    }


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
    {
      "specialist": "frontend_dev|backend_architect|devops|qa_tester",
      "task": "description",
      "priority": "high|medium|low"
    }
  ],
  "status": "assigned"
}"""


async def engineering_manager_node(state: AgentState) -> dict:
    """Engineering Manager node — assigns tasks to engineering specialists."""
    subtasks = state.get("subtasks", [])
    eng_tasks = [s for s in subtasks if s.get("department") == "engineering"]

    if not eng_tasks:
        empty_msg = "No engineering tasks to process."
        return {
            "current_agent": "engineering_manager",
            "messages": [{"role": "engineering_manager", "content": empty_msg}],
        }

    logger.info("Engineering Manager processing %d tasks", len(eng_tasks))

    try:
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            tasks_text = "\n".join(f"- {t['description']}" for t in eng_tasks)
            result = await llm_completion(
                messages=[
                    {"role": "system", "content": ENG_MGR_PROMPT},
                    {"role": "user", "content": f"Engineering tasks:\n{tasks_text}"},
                ],
                agent_id="eng-mgr-01",
            )
            # Parse assignments from LLM response
            assignments = _parse_assignments(result.content, eng_tasks)
            return {
                "current_agent": "engineering_manager",
                "assignments": assignments,
                "messages": [{"role": "engineering_manager", "content": result.content}],
                "status": "assigned",
            }
    except Exception as exc:
        logger.warning("LLM unavailable for eng manager: %s", exc)

    assignments = []
    for task in eng_tasks:
        desc = task["description"].lower()
        if any(kw in desc for kw in ["ui", "frontend", "react", "component", "css"]):
            assignments.append(_eng_task_row("frontend_dev", task))
        elif any(kw in desc for kw in ["deploy", "ci", "docker", "infra", "pipeline"]):
            assignments.append(_eng_task_row("devops", task))
        elif any(kw in desc for kw in ["test", "qa", "quality", "regression"]):
            assignments.append(_eng_task_row("qa_tester", task))
        else:
            assignments.append(_eng_task_row("backend_architect", task))

    payload = json.dumps({"assignments": assignments})
    return {
        "current_agent": "engineering_manager",
        "assignments": assignments,
        "messages": [{"role": "engineering_manager", "content": payload}],
        "status": "assigned",
    }


def _parse_assignments(llm_content: str, fallback_tasks: list[dict]) -> list[dict]:
    """Try to parse structured assignments from LLM JSON response."""
    try:
        parsed = json.loads(llm_content)
        if "assignments" in parsed and isinstance(parsed["assignments"], list):
            return parsed["assignments"]
    except (json.JSONDecodeError, TypeError):
        pass
    return [_eng_task_row("backend_architect", t) for t in fallback_tasks]
