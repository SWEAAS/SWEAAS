"""E2B sandbox lifecycle management for isolated agent code execution.

Each project gets its own sandbox during an execution session. The sandbox
is created at session start, has the project repo cloned into it, and is
destroyed when the session completes. This guarantees full data isolation.
"""

import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Per-project sandbox tracking (session-scoped)
_ACTIVE_SANDBOXES: dict[str, str] = {}


class SandboxService:
    """Creates and manages E2B Firecracker microVM sandboxes.

    Each project execution runs in its own sandbox to guarantee
    data isolation between users and projects.
    """

    async def get_or_create_sandbox(self, project_id: str) -> dict[str, Any]:
        """Get existing sandbox for a project or create a new one.

        Enforces one sandbox per project during execution.
        """
        if project_id in _ACTIVE_SANDBOXES:
            sandbox_id = _ACTIVE_SANDBOXES[project_id]
            return {
                "sandbox_id": sandbox_id,
                "status": "reused",
                "project_id": project_id,
            }

        result = await self.create_sandbox(project_id, agent_id="session")
        _ACTIVE_SANDBOXES[project_id] = result["sandbox_id"]
        return result

    async def create_sandbox(self, project_id: str, agent_id: str) -> dict:
        """Spin up a new E2B sandbox for an agent task."""
        if not settings.e2b_api_key:
            sandbox_id = f"sandbox-dev-{project_id[:8]}"
            _ACTIVE_SANDBOXES[project_id] = sandbox_id
            return {
                "sandbox_id": sandbox_id,
                "status": "running (dev mode)",
                "project_id": project_id,
            }

        from e2b import Sandbox

        sandbox = Sandbox.create(api_key=settings.e2b_api_key)
        _ACTIVE_SANDBOXES[project_id] = sandbox.id
        logger.info("Created E2B sandbox %s for project %s", sandbox.id, project_id)
        return {
            "sandbox_id": sandbox.id,
            "status": "running",
            "project_id": project_id,
        }

    async def clone_project_repo(self, sandbox_id: str, repo_name: str) -> dict:
        """Clone the project's GitHub repo into the sandbox at session start."""
        org = settings.github_org_name
        clone_url = f"https://github.com/{org}/{repo_name}.git"
        return await self.execute_command(
            sandbox_id,
            f"git clone {clone_url} /home/user/project",
        )

    async def execute_command(self, sandbox_id: str, command: str) -> dict:
        """Run a shell command inside an existing sandbox."""
        if sandbox_id.startswith("sandbox-dev-"):
            return {
                "sandbox_id": sandbox_id,
                "command": command,
                "stdout": f"[dev-mode] would run: {command}",
                "stderr": "",
                "exit_code": 0,
            }

        from e2b import Sandbox

        sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
        result = sandbox.commands.run(command)
        return {
            "sandbox_id": sandbox_id,
            "command": command,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }

    async def write_file(self, sandbox_id: str, path: str, content: str) -> dict:
        """Write a file inside the sandbox."""
        if sandbox_id.startswith("sandbox-dev-"):
            return {"sandbox_id": sandbox_id, "path": path, "status": "written (dev mode)"}

        from e2b import Sandbox

        sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
        sandbox.files.write(path, content)
        return {"sandbox_id": sandbox_id, "path": path, "status": "written"}

    async def read_file(self, sandbox_id: str, path: str) -> dict:
        """Read a file from the sandbox."""
        if sandbox_id.startswith("sandbox-dev-"):
            return {"sandbox_id": sandbox_id, "path": path, "content": "[dev-mode placeholder]"}

        from e2b import Sandbox

        sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
        content = sandbox.files.read(path)
        return {"sandbox_id": sandbox_id, "path": path, "content": content}

    async def destroy_sandbox(self, sandbox_id: str) -> dict:
        """Terminate and clean up a sandbox."""
        project_ids_to_remove = [
            pid for pid, sid in _ACTIVE_SANDBOXES.items() if sid == sandbox_id
        ]
        for pid in project_ids_to_remove:
            del _ACTIVE_SANDBOXES[pid]

        if sandbox_id.startswith("sandbox-dev-"):
            return {"sandbox_id": sandbox_id, "status": "destroyed (dev mode)"}

        from e2b import Sandbox

        sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
        sandbox.kill()
        logger.info("Destroyed E2B sandbox %s", sandbox_id)
        return {"sandbox_id": sandbox_id, "status": "destroyed"}

    async def destroy_project_sandbox(self, project_id: str) -> dict:
        """Destroy the sandbox for a specific project (called at session end)."""
        sandbox_id = _ACTIVE_SANDBOXES.get(project_id)
        if not sandbox_id:
            return {"project_id": project_id, "status": "no_active_sandbox"}
        return await self.destroy_sandbox(sandbox_id)
