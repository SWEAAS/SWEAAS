"""Aggregator node — collects specialist results and produces a session summary.

This node runs after all specialists have completed. It merges their
results into a structured session summary for the CTO review phase.
"""

import json
import logging
from datetime import datetime, timezone

from app.agents.state import AgentState

logger = logging.getLogger(__name__)

AGGREGATOR_PROMPT = """You are the Session Aggregator for a software engineering team.
You receive results from multiple specialist agents and must produce a concise session summary.

Create a JSON object with:
{
  "summary": "2-3 sentence executive overview",
  "completed_tasks": ["list of tasks completed"],
  "issues_found": ["list of issues or blockers encountered"],
  "pull_requests": ["list of PRs created, if any"],
  "recommendations": ["brief next-step recommendations"]
}"""


async def aggregator_node(state: AgentState) -> dict:
    """Merge specialist results into a structured session summary."""
    results = state.get("results", [])
    messages = state.get("messages", [])
    session_id = state.get("session_id", "unknown")

    logger.info(
        "Aggregator collecting %d results for session %s",
        len(results),
        session_id,
    )

    specialist_outputs = []
    for r in results:
        agent = r.get("agent", "unknown")
        output = r.get("output", "")
        specialist_outputs.append(f"[{agent}]: {output[:2000]}")

    combined = "\n\n".join(specialist_outputs) if specialist_outputs else "No specialist results."

    try:
        from app.core.llm import llm_completion, llm_has_credentials

        if llm_has_credentials():
            result = await llm_completion(
                messages=[
                    {"role": "system", "content": AGGREGATOR_PROMPT},
                    {
                        "role": "user",
                        "content": f"Specialist results:\n{combined}",
                    },
                ],
                agent_id="cto-01",
            )
            session_summary = result.content
            return {
                "current_agent": "aggregator",
                "session_summary": session_summary,
                "status": "review_pending",
                "messages": [{"role": "aggregator", "content": session_summary}],
            }
    except Exception as exc:
        logger.warning("LLM unavailable for aggregator: %s", exc)

    now = datetime.now(timezone.utc).isoformat()
    agents_involved = list({r.get("agent", "unknown") for r in results})
    fallback_summary = json.dumps({
        "summary": f"Session {session_id} completed at {now}. "
                   f"{len(results)} specialist(s) contributed.",
        "completed_tasks": [r.get("output", "")[:200] for r in results],
        "agents_involved": agents_involved,
        "issues_found": [],
        "recommendations": ["Review specialist outputs for next iteration."],
    })

    return {
        "current_agent": "aggregator",
        "session_summary": fallback_summary,
        "status": "review_pending",
        "messages": [{"role": "aggregator", "content": fallback_summary}],
    }
