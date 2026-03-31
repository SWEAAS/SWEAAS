"""LangChain tools wrapping E2B sandbox operations for specialist agents."""

from langchain_core.tools import tool


@tool
def execute_shell_command(sandbox_id: str, command: str) -> str:
    """Execute a shell command in the E2B sandbox.

    Args:
        sandbox_id: The ID of the active sandbox.
        command: Shell command to run.

    Returns:
        stdout/stderr output from the command.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.e2b_api_key or sandbox_id.startswith("sandbox-dev-"):
        return f"[dev-mode] would run: {command}"

    from e2b import Sandbox

    sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
    result = sandbox.commands.run(command)
    output = result.stdout
    if result.stderr:
        output += f"\n[STDERR] {result.stderr}"
    return output


@tool
def write_code_file(sandbox_id: str, file_path: str, content: str) -> str:
    """Write a file into the E2B sandbox.

    Args:
        sandbox_id: The ID of the active sandbox.
        file_path: Path within the sandbox to write to.
        content: File content to write.

    Returns:
        Confirmation message.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.e2b_api_key or sandbox_id.startswith("sandbox-dev-"):
        return f"[dev-mode] would write {len(content)} chars to {file_path}"

    from e2b import Sandbox

    sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
    sandbox.files.write(file_path, content)
    return f"Written {len(content)} chars to {file_path}"


@tool
def read_code_file(sandbox_id: str, file_path: str) -> str:
    """Read a file from the E2B sandbox.

    Args:
        sandbox_id: The ID of the active sandbox.
        file_path: Path within the sandbox to read.

    Returns:
        File contents.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.e2b_api_key or sandbox_id.startswith("sandbox-dev-"):
        return f"[dev-mode] placeholder content for {file_path}"

    from e2b import Sandbox

    sandbox = Sandbox.connect(sandbox_id, api_key=settings.e2b_api_key)
    return sandbox.files.read(file_path)
