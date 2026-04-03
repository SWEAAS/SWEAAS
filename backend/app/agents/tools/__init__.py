"""Tool registry — maps agent roles to their permitted LangChain tools.

Each specialist gets scoped tools following the least-privilege principle
(inspired by claude-code's allowed-tools frontmatter pattern).
"""

from app.agents.tools.code_tools import execute_shell_command, read_code_file, write_code_file
from app.agents.tools.communication_tools import schedule_meeting, send_agent_email
from app.agents.tools.github_tools import (
    commit_and_push,
    create_branch,
    create_pull_request,
    get_file_contents,
)
from app.agents.tools.search_tools import search_agent_memory, search_codebase
from app.agents.tools.sentry_tools import get_issue_events, get_unresolved_issues

TOOL_REGISTRY: dict[str, list] = {
    "frontend_dev": [
        execute_shell_command, write_code_file, read_code_file,
        create_branch, commit_and_push, create_pull_request, get_file_contents,
        search_agent_memory, search_codebase,
    ],
    "backend_architect": [
        execute_shell_command, write_code_file, read_code_file,
        create_branch, commit_and_push, create_pull_request, get_file_contents,
        search_agent_memory, search_codebase,
    ],
    "devops": [
        execute_shell_command, write_code_file, read_code_file,
        create_branch, commit_and_push, create_pull_request, get_file_contents,
        search_agent_memory, search_codebase,
    ],
    "qa_tester": [
        execute_shell_command, write_code_file, read_code_file,
        get_unresolved_issues, get_issue_events,
        search_agent_memory, search_codebase,
    ],
    "engineering_manager": [
        search_agent_memory, search_codebase,
        send_agent_email, schedule_meeting,
    ],
    "product_manager": [
        search_agent_memory, search_codebase,
        send_agent_email, schedule_meeting,
    ],
    "marketing_manager": [
        search_agent_memory, search_codebase,
        send_agent_email,
    ],
    "product_ops": [
        search_agent_memory, search_codebase,
    ],
    "growth_analyst": [
        search_agent_memory, search_codebase,
    ],
    "cto": [
        search_agent_memory, search_codebase,
        send_agent_email,
    ],
}


def get_tools_for_role(role: str) -> list:
    """Return the list of LangChain tools available to a given agent role."""
    return TOOL_REGISTRY.get(role, [])
