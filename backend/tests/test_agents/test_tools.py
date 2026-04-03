"""Tests for agent tool definitions and tool functions."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.agents.tools import TOOL_REGISTRY, get_tools_for_role
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

# All tool modules use lazy `from app.core.config import get_settings` inside
# function bodies, so we patch at the source.
_GET_SETTINGS = "app.core.config.get_settings"


def _settings(**overrides):
    """Return a MagicMock that behaves like Settings with common defaults."""
    s = MagicMock()
    s.e2b_api_key = overrides.get("e2b_api_key", "")
    s.sentry_auth_token = overrides.get("sentry_auth_token", "")
    s.sentry_org = overrides.get("sentry_org", "test-org")
    s.agentmail_api_key = overrides.get("agentmail_api_key", "")
    s.chroma_host = overrides.get("chroma_host", "localhost")
    s.chroma_port = overrides.get("chroma_port", 8000)
    s.github_app_id = overrides.get("github_app_id", "")
    s.github_app_private_key_path = overrides.get("github_app_private_key_path", "")
    s.github_org_name = overrides.get("github_org_name", "test-org")
    return s


# ── Tool definitions / metadata ───────────────────────────────────────────

ALL_TOOLS = [
    execute_shell_command,
    write_code_file,
    read_code_file,
    create_branch,
    commit_and_push,
    create_pull_request,
    get_file_contents,
    search_agent_memory,
    search_codebase,
    get_unresolved_issues,
    get_issue_events,
    send_agent_email,
    schedule_meeting,
]


class TestToolDefinitions:
    @pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t.name)
    def test_tool_has_name(self, tool):
        assert tool.name
        assert isinstance(tool.name, str)

    @pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t.name)
    def test_tool_has_description(self, tool):
        assert tool.description
        assert len(tool.description) > 10

    @pytest.mark.parametrize("tool", ALL_TOOLS, ids=lambda t: t.name)
    def test_tool_has_args_schema(self, tool):
        schema = tool.args_schema
        assert schema is not None


# ── Tool registry ─────────────────────────────────────────────────────────

class TestToolRegistry:
    EXPECTED_ROLES = [
        "frontend_dev",
        "backend_architect",
        "devops",
        "qa_tester",
        "engineering_manager",
        "product_manager",
        "marketing_manager",
        "product_ops",
        "growth_analyst",
        "cto",
    ]

    @pytest.mark.parametrize("role", EXPECTED_ROLES)
    def test_role_has_tools(self, role):
        tools = get_tools_for_role(role)
        assert len(tools) > 0

    def test_unknown_role_returns_empty(self):
        assert get_tools_for_role("imaginary_agent") == []

    def test_qa_tester_has_sentry_tools(self):
        tools = get_tools_for_role("qa_tester")
        tool_names = {t.name for t in tools}
        assert "get_unresolved_issues" in tool_names
        assert "get_issue_events" in tool_names

    def test_specialist_devs_have_code_tools(self):
        for role in ("frontend_dev", "backend_architect", "devops"):
            tools = get_tools_for_role(role)
            tool_names = {t.name for t in tools}
            assert "execute_shell_command" in tool_names
            assert "write_code_file" in tool_names

    def test_managers_have_communication_tools(self):
        for role in ("engineering_manager", "product_manager"):
            tools = get_tools_for_role(role)
            tool_names = {t.name for t in tools}
            assert "send_agent_email" in tool_names
            assert "schedule_meeting" in tool_names


# ── Code tools (mocked sandbox) ──────────────────────────────────────────

class TestCodeTools:
    @patch(_GET_SETTINGS, return_value=_settings(e2b_api_key=""))
    def test_execute_shell_dev_mode(self, _gs):
        result = execute_shell_command.invoke({"sandbox_id": "sandbox-dev-1", "command": "ls -la"})
        assert "[dev-mode]" in result
        assert "ls -la" in result

    @patch(_GET_SETTINGS, return_value=_settings())
    def test_write_code_file_dev_mode(self, _gs):
        result = write_code_file.invoke(
            {"sandbox_id": "sandbox-dev-1", "file_path": "/app/main.py", "content": "print('hi')"}
        )
        assert "[dev-mode]" in result

    @patch(_GET_SETTINGS, return_value=_settings())
    def test_read_code_file_dev_mode(self, _gs):
        result = read_code_file.invoke(
            {"sandbox_id": "sandbox-dev-1", "file_path": "/app/main.py"}
        )
        assert "[dev-mode]" in result

    @patch(_GET_SETTINGS, return_value=_settings(e2b_api_key="real-key"))
    def test_execute_shell_dev_prefix_sandbox(self, _gs):
        result = execute_shell_command.invoke({"sandbox_id": "sandbox-dev-abc", "command": "echo hi"})
        assert "[dev-mode]" in result


# ── GitHub tools (mocked) ────────────────────────────────────────────────

class TestGitHubTools:
    @patch(
        "app.agents.tools.github_tools._get_github_context",
        return_value=("dev-token", "org", "https://api.github.com"),
    )
    def test_create_branch_dev_mode(self, _ctx):
        result = create_branch.invoke(
            {"repo_name": "my-repo", "branch_name": "feat/new", "base": "main"}
        )
        assert "[dev-mode]" in result
        assert "feat/new" in result

    @patch(
        "app.agents.tools.github_tools._get_github_context",
        return_value=("dev-token", "org", "https://api.github.com"),
    )
    def test_commit_and_push_dev_mode(self, _ctx):
        result = commit_and_push.invoke({
            "repo_name": "my-repo",
            "branch_name": "feat/new",
            "message": "add stuff",
            "files": '[{"path": "a.py", "content": "x"}]',
        })
        assert "[dev-mode]" in result

    @patch(
        "app.agents.tools.github_tools._get_github_context",
        return_value=("dev-token", "org", "https://api.github.com"),
    )
    def test_create_pull_request_dev_mode(self, _ctx):
        result = create_pull_request.invoke({
            "repo_name": "my-repo",
            "branch_name": "feat/new",
            "title": "Add feature",
            "body": "Description",
        })
        assert "[dev-mode]" in result

    @patch(
        "app.agents.tools.github_tools._get_github_context",
        return_value=("dev-token", "org", "https://api.github.com"),
    )
    def test_get_file_contents_dev_mode(self, _ctx):
        result = get_file_contents.invoke({
            "repo_name": "my-repo",
            "file_path": "README.md",
            "branch": "main",
        })
        assert "[dev-mode]" in result


# ── Sentry tools (mocked) ────────────────────────────────────────────────

class TestSentryTools:
    @patch(_GET_SETTINGS, return_value=_settings(sentry_auth_token=""))
    def test_get_unresolved_issues_no_token(self, _gs):
        result = get_unresolved_issues.invoke({"project_slug": "my-project"})
        assert result == "[]"

    @patch(_GET_SETTINGS, return_value=_settings(sentry_auth_token=""))
    def test_get_issue_events_no_token(self, _gs):
        result = get_issue_events.invoke({"issue_id": "12345"})
        assert result == "[]"

    @patch("httpx.get")
    @patch(_GET_SETTINGS, return_value=_settings(sentry_auth_token="tok-abc"))
    def test_get_unresolved_issues_with_token(self, _gs, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '[{"id": "1", "title": "Error"}]'
        mock_get.return_value = mock_resp

        result = get_unresolved_issues.invoke({"project_slug": "my-project"})
        assert "Error" in result
        mock_get.assert_called_once()

    @patch("httpx.get")
    @patch(_GET_SETTINGS, return_value=_settings(sentry_auth_token="tok-abc"))
    def test_get_issue_events_with_token(self, _gs, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"event_id": "ev1"}'
        mock_get.return_value = mock_resp

        result = get_issue_events.invoke({"issue_id": "99"})
        assert "ev1" in result

    @patch("httpx.get")
    @patch(_GET_SETTINGS, return_value=_settings(sentry_auth_token="tok-abc"))
    def test_get_unresolved_issues_api_error(self, _gs, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_get.return_value = mock_resp

        result = get_unresolved_issues.invoke({"project_slug": "my-project"})
        assert "403" in result


# ── Search tools (mocked ChromaDB) ───────────────────────────────────────

class TestSearchTools:
    @patch(_GET_SETTINGS, return_value=_settings())
    def test_search_agent_memory_unavailable(self, _gs):
        result = search_agent_memory.invoke(
            {"project_id": "proj-1", "query": "auth flow", "n_results": 3}
        )
        assert "unavailable" in result.lower() or "error" in result.lower()

    @patch(_GET_SETTINGS, return_value=_settings())
    def test_search_codebase_unavailable(self, _gs):
        result = search_codebase.invoke(
            {"project_id": "proj-1", "query": "database models", "n_results": 3}
        )
        assert "unavailable" in result.lower() or "error" in result.lower()


# ── Communication tools ──────────────────────────────────────────────────

class TestCommunicationTools:
    @patch(_GET_SETTINGS, return_value=_settings(agentmail_api_key=""))
    def test_send_agent_email_dev_mode(self, _gs):
        result = send_agent_email.invoke({
            "recipient": "alice@example.com",
            "subject": "Update",
            "body": "Your project is progressing.",
        })
        assert "[dev-mode]" in result
        assert "alice@example.com" in result

    def test_schedule_meeting_returns_url(self):
        result = schedule_meeting.invoke({
            "attendee_email": "bob@example.com",
            "title": "Sprint Review",
            "duration_minutes": 45,
        })
        assert "bob@example.com" in result
        assert "Sprint Review" in result
        assert "https://meet.sweaas.dev/" in result
        assert "45" in result
