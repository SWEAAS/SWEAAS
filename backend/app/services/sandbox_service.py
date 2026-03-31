"""E2B sandbox lifecycle management for isolated agent code execution."""

import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SandboxService:
    """Creates and manages E2B Firecracker microVM sandboxes.

    Each agent task runs in its own sandbox to guarantee data isolation
    between users and projects.
    """

    async def create_sandbox(self, project_id: str, agent_id: str) -> dict:
        """Spin up a new E2B sandbox for an agent task."""
        if not settings.e2b_api_key:
            return {
                "sandbox_id": f"sandbox-dev-{agent_id}",
                "status": "running (dev mode)",
                "project_id": project_id,
            }

        from e2b import Sandbox

        sandbox = Sandbox.create(api_key=settings.e2b_api_key)
        return {
            "sandbox_id": sandbox.id,
            "status": "running",
            "project_id": project_id,
        }

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
        if sandbox_id.startswith("sandbox-dev-"):
            return {"sandbox_id": sandbox_id, "status": "destroyed (dev mode)"}

        from e2b import Sandbox

        sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
        sandbox.kill()
        return {"sandbox_id": sandbox_id, "status": "destroyed"}
