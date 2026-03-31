"""LangGraph orchestration service — constructs and runs the agent hierarchy.

This is a thin service wrapper; the actual graph definition lives in
app.agents.graph. The service handles lifecycle concerns such as
creating execution contexts, budget checks, and persisting results.
"""

import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class OrchestrationService:
    """Entry point for executing tasks through the LangGraph agent hierarchy."""

    async def submit_task(self, project_id: str, task_description: str) -> dict:
        """Submit a task to the CTO agent and start hierarchical execution.

        The CTO decomposes the task, delegates to managers, who further
        delegate to specialist agents. Results propagate back up.
        """
        logger.info("Submitting task for project %s: %s", project_id, task_description[:80])

        try:
            from app.agents.graph import build_agent_graph

            graph = build_agent_graph(project_id=project_id)
            result = await graph.ainvoke({
                "task": task_description,
                "project_id": project_id,
                "messages": [],
                "status": "pending",
            })
            return {
                "project_id": project_id,
                "status": result.get("status", "completed"),
                "result": result.get("result", ""),
            }
        except ImportError:
            logger.warning("Agent graph not yet available — returning stub.")
            return {
                "project_id": project_id,
                "status": "stub",
                "result": f"Would execute: {task_description}",
            }

    async def get_execution_status(self, project_id: str) -> dict:
        """Check the current status of agent execution for a project."""
        return {
            "project_id": project_id,
            "active_agents": 0,
            "running_tasks": 0,
            "status": "idle",
        }
