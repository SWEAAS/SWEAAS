"""Shared state definition for the LangGraph agent hierarchy.

All agents in the graph read from and write to this state. It flows
through the supervisor -> manager -> specialist pipeline and back up
via the aggregator and CTO review nodes.
"""

from typing import Annotated

from typing_extensions import TypedDict


def _merge_lists(existing: list[dict], new: list[dict]) -> list[dict]:
    """Reducer that appends new items to an existing list (append-only)."""
    return existing + new


class AgentState(TypedDict, total=False):
    """Typed state shared across the entire agent hierarchy.

    Reducers (_merge_lists) ensure parallel fan-out nodes append rather
    than overwrite each other's contributions.
    """

    task: str
    project_id: str
    session_id: str

    # Resolved from Project model before graph invocation
    sandbox_id: str
    repo_name: str
    sentry_project_slug: str

    # Org goals / requirements fetched from S3 at graph start
    onboarding_context: str

    # Pending feedback (user, Sentry issues) injected before execution
    feedback_items: Annotated[list[dict], _merge_lists]

    messages: Annotated[list[dict], _merge_lists]
    status: str

    # CTO -> managers
    subtasks: Annotated[list[dict], _merge_lists]

    # Managers -> specialists
    assignments: Annotated[list[dict], _merge_lists]

    # Specialists -> aggregator -> CTO review
    results: Annotated[list[dict], _merge_lists]

    current_agent: str
    budget_remaining: int
    error: str

    # Populated by the aggregator node
    session_summary: str

    # Populated by the CTO review node
    direction_report: str
