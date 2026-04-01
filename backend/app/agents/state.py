"""Shared state definition for the LangGraph agent hierarchy.

All agents in the graph read from and write to this state. It flows
through the supervisor -> manager -> specialist pipeline.
"""

from typing import Annotated

from typing_extensions import TypedDict


def _merge_messages(existing: list[dict], new: list[dict]) -> list[dict]:
    """Reducer that appends new messages to the existing list."""
    return existing + new


class AgentState(TypedDict, total=False):
    """Typed state shared across the entire agent hierarchy.

    Fields:
        task: The original user/system task description.
        project_id: ID of the project this execution belongs to.
        messages: Accumulated conversation messages (append-only via reducer).
        status: Current execution status.
        subtasks: Decomposed subtasks created by supervisors/managers.
        results: Results from specialist agent execution.
        current_agent: Name of the agent currently processing.
        budget_remaining: Remaining token budget for this execution.
        error: Error message if execution failed.
    """

    task: str
    project_id: str
    messages: Annotated[list[dict], _merge_messages]
    status: str
    subtasks: list[dict]
    results: list[dict]
    current_agent: str
    budget_remaining: int
    error: str
