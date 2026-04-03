"""Unit tests for SandboxService — E2B sandbox lifecycle management."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

import app.services.sandbox_service as sandbox_mod
from app.services.sandbox_service import SandboxService


@pytest.fixture(autouse=True)
def _clear_active_sandboxes():
    """Reset module-level sandbox tracking between tests."""
    sandbox_mod._ACTIVE_SANDBOXES.clear()
    yield
    sandbox_mod._ACTIVE_SANDBOXES.clear()


# ---------------------------------------------------------------------------
# Dev-mode fallback (no E2B API key)
# ---------------------------------------------------------------------------

class TestDevMode:

    def test_create_sandbox_dev(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        svc = SandboxService()
        result = asyncio.run(svc.create_sandbox("proj-abc123", "agent-1"))
        assert result["status"] == "running (dev mode)"
        assert result["sandbox_id"].startswith("sandbox-dev-")
        assert result["project_id"] == "proj-abc123"

    def test_execute_command_dev(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        svc = SandboxService()
        result = asyncio.run(svc.execute_command("sandbox-dev-abc", "ls -la"))
        assert result["exit_code"] == 0
        assert "[dev-mode]" in result["stdout"]
        assert result["command"] == "ls -la"

    def test_write_file_dev(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        svc = SandboxService()
        result = asyncio.run(svc.write_file("sandbox-dev-abc", "/tmp/x.py", "print(1)"))
        assert result["status"] == "written (dev mode)"
        assert result["path"] == "/tmp/x.py"

    def test_read_file_dev(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        svc = SandboxService()
        result = asyncio.run(svc.read_file("sandbox-dev-abc", "/tmp/x.py"))
        assert result["content"] == "[dev-mode placeholder]"

    def test_destroy_sandbox_dev(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        sandbox_mod._ACTIVE_SANDBOXES["proj-1"] = "sandbox-dev-proj1"
        svc = SandboxService()
        result = asyncio.run(svc.destroy_sandbox("sandbox-dev-proj1"))
        assert result["status"] == "destroyed (dev mode)"
        assert "proj-1" not in sandbox_mod._ACTIVE_SANDBOXES


# ---------------------------------------------------------------------------
# get_or_create_sandbox — cache behaviour
# ---------------------------------------------------------------------------

class TestGetOrCreateSandbox:

    def test_cache_miss_creates_new(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        svc = SandboxService()
        result = asyncio.run(svc.get_or_create_sandbox("proj-new"))
        assert result["sandbox_id"].startswith("sandbox-dev-")
        assert result["project_id"] == "proj-new"
        assert "proj-new" in sandbox_mod._ACTIVE_SANDBOXES

    def test_cache_hit_reuses(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        sandbox_mod._ACTIVE_SANDBOXES["proj-hit"] = "sandbox-dev-cached"
        svc = SandboxService()
        result = asyncio.run(svc.get_or_create_sandbox("proj-hit"))
        assert result["status"] == "reused"
        assert result["sandbox_id"] == "sandbox-dev-cached"


# ---------------------------------------------------------------------------
# Real E2B path — e2b.Sandbox mocked
# ---------------------------------------------------------------------------

class TestRealSandbox:

    def test_create_sandbox_real(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.e2b_api_key", "e2b-key-123"
        )
        mock_sandbox = MagicMock()
        mock_sandbox.id = "sb-real-789"

        with patch("e2b.Sandbox.create", return_value=mock_sandbox) as mock_create:
            svc = SandboxService()
            result = asyncio.run(svc.create_sandbox("proj-x", "agent-2"))

        mock_create.assert_called_once_with(api_key="e2b-key-123")
        assert result["sandbox_id"] == "sb-real-789"
        assert result["status"] == "running"
        assert sandbox_mod._ACTIVE_SANDBOXES["proj-x"] == "sb-real-789"

    def test_execute_command_real(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.e2b_api_key", "e2b-key-123"
        )
        mock_sandbox = MagicMock()
        mock_result = MagicMock(stdout="hello", stderr="", exit_code=0)
        mock_sandbox.commands.run.return_value = mock_result

        with patch("e2b.Sandbox.connect", return_value=mock_sandbox):
            svc = SandboxService()
            result = asyncio.run(svc.execute_command("sb-real-789", "echo hello"))

        assert result["stdout"] == "hello"
        assert result["exit_code"] == 0

    def test_write_file_real(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.e2b_api_key", "e2b-key-123"
        )
        mock_sandbox = MagicMock()

        with patch("e2b.Sandbox.connect", return_value=mock_sandbox):
            svc = SandboxService()
            result = asyncio.run(svc.write_file("sb-real-789", "/app/x.py", "code"))

        mock_sandbox.files.write.assert_called_once_with("/app/x.py", "code")
        assert result["status"] == "written"

    def test_read_file_real(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.e2b_api_key", "e2b-key-123"
        )
        mock_sandbox = MagicMock()
        mock_sandbox.files.read.return_value = "file-content"

        with patch("e2b.Sandbox.connect", return_value=mock_sandbox):
            svc = SandboxService()
            result = asyncio.run(svc.read_file("sb-real-789", "/app/x.py"))

        assert result["content"] == "file-content"

    def test_destroy_sandbox_real(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.e2b_api_key", "e2b-key-123"
        )
        sandbox_mod._ACTIVE_SANDBOXES["proj-z"] = "sb-real-789"
        mock_sandbox = MagicMock()

        with patch("e2b.Sandbox.connect", return_value=mock_sandbox):
            svc = SandboxService()
            result = asyncio.run(svc.destroy_sandbox("sb-real-789"))

        mock_sandbox.kill.assert_called_once()
        assert result["status"] == "destroyed"
        assert "proj-z" not in sandbox_mod._ACTIVE_SANDBOXES


# ---------------------------------------------------------------------------
# destroy_project_sandbox
# ---------------------------------------------------------------------------

class TestDestroyProjectSandbox:

    def test_delegates_to_destroy_sandbox(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        sandbox_mod._ACTIVE_SANDBOXES["proj-del"] = "sandbox-dev-proj-del"
        svc = SandboxService()
        result = asyncio.run(svc.destroy_project_sandbox("proj-del"))
        assert result["status"] == "destroyed (dev mode)"
        assert "proj-del" not in sandbox_mod._ACTIVE_SANDBOXES

    def test_no_active_sandbox(self, monkeypatch):
        svc = SandboxService()
        result = asyncio.run(svc.destroy_project_sandbox("nonexistent"))
        assert result["status"] == "no_active_sandbox"


# ---------------------------------------------------------------------------
# clone_project_repo
# ---------------------------------------------------------------------------

class TestCloneProjectRepo:

    def test_clone_builds_correct_command(self, monkeypatch):
        monkeypatch.setattr("app.services.sandbox_service.settings.e2b_api_key", "")
        monkeypatch.setattr(
            "app.services.sandbox_service.settings.github_org_name", "TestOrg"
        )
        svc = SandboxService()
        result = asyncio.run(svc.clone_project_repo("sandbox-dev-abc", "my-repo"))
        assert "git clone" in result["command"]
        assert "TestOrg/my-repo" in result["command"]
