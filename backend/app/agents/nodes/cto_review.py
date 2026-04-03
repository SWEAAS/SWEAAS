"""CTO Review node — reviews aggregated session results and sets project direction.

Runs after the aggregator. The CTO assesses what was accomplished,
optionally evaluates PR quality via Greptile, and produces a direction
report guiding the next scheduling cycle.
"""

import json
import logging
from datetime import datetime, timezone

from app.agents.state import AgentState

logger = logging.getLogger(__name__)

CTO_REVIEW_PROMPT = """You are the CTO reviewing the results of an engineering session.
You have the session summary and the original task.

Produce a direction report as JSON:
{
  "assessment": "Brief assessment of session quality and outcomes",
  "completed": true/false,
  "next_priorities": [
    {"description": "What to work on next", "department": "engineering|product|marketing", "priority": "high|medium|low"}
  ],
  "feedback_addressed": ["list of feedback items that were addressed"],
  "blockers": ["any blockers or concerns"],
  "merge_decisions": [
    {"pr": "PR identifier", "decision": "merge|reject|needs_revision", "reason": "explanation"}
  ]
}"""


async def cto_review_node(state: AgentState) -> dict:
    """CTO reviews session results and produces a direction report."""
    session_summary = state.get("session_summary", "")
    task = state.get("task", "")
    project_id = state.get("project_id", "")
    feedback_items = state.get("feedback_items", [])

    logger.info("CTO reviewing session for project %s", project_id)

    feedback_text = ""
    if feedback_items:
        feedback_lines = [
            f"- [{f.get('source', 'unknown')}] {f.get('title', '')}: {f.get('body', '')[:200]}"
            for f in feedback_items[:10]
        ]
        feedback_text = f"\n\nPending feedback:\n" + "\n".join(feedback_lines)

    repo_name = state.get("repo_name", "")
    greptile_review = await _greptile_pr_assessment(repo_name, state)

    try:
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            user_content = (
                f"Original task: {task}\n\n"
                f"Session summary:\n{session_summary}\n"
                f"{feedback_text}\n"
                f"{greptile_review}"
            )
            result = await llm_completion(
                messages=[
                    {"role": "system", "content": CTO_REVIEW_PROMPT},
                    {"role": "user", "content": user_content},
                ],
                agent_id="cto-01",
            )
            direction_report = result.content
            return {
                "current_agent": "cto_review",
                "direction_report": direction_report,
                "status": "completed",
                "messages": [{"role": "cto_review", "content": direction_report}],
            }
    except Exception as exc:
        logger.warning("LLM unavailable for CTO review: %s", exc)

    now = datetime.now(timezone.utc).isoformat()
    fallback = json.dumps({
        "assessment": f"Session reviewed at {now}. See session summary for details.",
        "completed": True,
        "next_priorities": [
            {
                "description": "Continue with pending tasks and address feedback",
                "department": "engineering",
                "priority": "high",
            }
        ],
        "feedback_addressed": [],
        "blockers": [],
        "merge_decisions": [],
    })

    return {
        "current_agent": "cto_review",
        "direction_report": fallback,
        "status": "completed",
        "messages": [{"role": "cto_review", "content": fallback}],
    }


async def _greptile_pr_assessment(repo_name: str, state: AgentState) -> str:
    """Check Greptile for any PR reviews if available."""
    if not repo_name:
        return ""
    try:
        from app.core.config import get_settings
        from app.services.greptile_service import GreptileService

        settings = get_settings()
        if not settings.greptile_api_key:
            return ""

        greptile = GreptileService()
        result = await greptile.query(
            repo_name=repo_name,
            question="What are the recent code quality issues or PR review concerns?",
        )
        message = result.get("message", "")
        if message:
            return f"\n\nGreptile code review:\n{message[:1500]}"
    except Exception as exc:
        logger.debug("Greptile review unavailable: %s", exc)
    return ""
