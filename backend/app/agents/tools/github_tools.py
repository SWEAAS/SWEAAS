"""LangChain tools for GitHub operations — commit, branch, PR."""

from langchain_core.tools import tool


@tool
def create_branch(repo_name: str, branch_name: str, base: str = "main") -> str:
    """Create a new branch in the project repository.

    Args:
        repo_name: Repository name within the SWEAAS org.
        branch_name: Name for the new branch.
        base: Base branch to branch from.

    Returns:
        Confirmation with branch ref.
    """
    return f"[stub] Created branch '{branch_name}' from '{base}' in {repo_name}"


@tool
def commit_and_push(repo_name: str, branch_name: str, message: str, files: str) -> str:
    """Commit changed files and push to the remote branch.

    Args:
        repo_name: Repository name.
        branch_name: Target branch.
        message: Commit message.
        files: Comma-separated list of file paths to commit.

    Returns:
        Confirmation with commit SHA.
    """
    return f"[stub] Committed {files} to {branch_name} with message: {message}"


@tool
def create_pull_request(repo_name: str, branch_name: str, title: str, body: str) -> str:
    """Open a pull request for code review.

    Args:
        repo_name: Repository name.
        branch_name: Source branch for the PR.
        title: PR title.
        body: PR description body.

    Returns:
        PR URL.
    """
    return f"[stub] PR created: {title} from {branch_name}"
