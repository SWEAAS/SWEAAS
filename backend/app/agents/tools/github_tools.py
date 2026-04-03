"""LangChain tools for GitHub operations — commit, branch, PR.

Uses the GitHubService's installation token for authenticated requests.
Falls back to dev-mode stubs when credentials are absent.
"""

import logging

import httpx
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def _get_github_context() -> tuple[str, str, str]:
    """Return (token, org, base_url) from GitHubService credentials."""
    from app.core.config import get_settings

    settings = get_settings()
    org = settings.github_org_name
    base = "https://api.github.com"

    if not settings.github_app_id or not settings.github_app_private_key_path:
        return "dev-token", org, base

    import time

    import jwt as pyjwt

    with open(settings.github_app_private_key_path) as f:
        private_key = f.read()

    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + (10 * 60), "iss": settings.github_app_id}
    encoded_jwt = pyjwt.encode(payload, private_key, algorithm="RS256")

    try:
        resp = httpx.get(
            f"{base}/app/installations",
            headers={
                "Authorization": f"Bearer {encoded_jwt}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        installation_id = resp.json()[0]["id"]

        resp = httpx.post(
            f"{base}/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {encoded_jwt}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()["token"], org, base
    except Exception as exc:
        logger.warning("GitHub token acquisition failed: %s", exc)
        return "dev-token", org, base


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }


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
    token, org, base_url = _get_github_context()
    if token == "dev-token":
        return f"[dev-mode] Created branch '{branch_name}' from '{base}' in {repo_name}"

    try:
        resp = httpx.get(
            f"{base_url}/repos/{org}/{repo_name}/git/ref/heads/{base}",
            headers=_headers(token),
        )
        resp.raise_for_status()
        sha = resp.json()["object"]["sha"]

        resp = httpx.post(
            f"{base_url}/repos/{org}/{repo_name}/git/refs",
            headers=_headers(token),
            json={"ref": f"refs/heads/{branch_name}", "sha": sha},
        )
        resp.raise_for_status()
        return f"Created branch '{branch_name}' from '{base}' (sha: {sha[:8]})"
    except Exception as exc:
        return f"Error creating branch: {exc}"


@tool
def commit_and_push(repo_name: str, branch_name: str, message: str, files: str) -> str:
    """Commit file changes and push to the remote branch.

    Args:
        repo_name: Repository name.
        branch_name: Target branch.
        message: Commit message.
        files: JSON array of objects with "path" and "content" keys,
               e.g. '[{"path": "src/app.py", "content": "print(1)"}]'.
               Falls back to a no-op commit if parsing fails.

    Returns:
        Confirmation with commit SHA.
    """
    import json as _json

    token, org, base_url = _get_github_context()
    if token == "dev-token":
        return f"[dev-mode] Committed to {branch_name} with message: {message}"

    try:
        file_list: list[dict] = _json.loads(files) if files.strip().startswith("[") else []
    except (ValueError, TypeError):
        file_list = []

    if not file_list:
        return "Error: 'files' must be a JSON array of {path, content} objects"

    try:
        repo_path = f"{base_url}/repos/{org}/{repo_name}"

        resp = httpx.get(
            f"{repo_path}/git/ref/heads/{branch_name}",
            headers=_headers(token),
        )
        resp.raise_for_status()
        base_sha = resp.json()["object"]["sha"]

        resp = httpx.get(
            f"{repo_path}/git/commits/{base_sha}",
            headers=_headers(token),
        )
        resp.raise_for_status()
        base_tree_sha = resp.json()["tree"]["sha"]

        tree_entries = []
        for f in file_list:
            blob_resp = httpx.post(
                f"{repo_path}/git/blobs",
                headers=_headers(token),
                json={"content": f["content"], "encoding": "utf-8"},
            )
            blob_resp.raise_for_status()
            tree_entries.append({
                "path": f["path"],
                "mode": "100644",
                "type": "blob",
                "sha": blob_resp.json()["sha"],
            })

        tree_resp = httpx.post(
            f"{repo_path}/git/trees",
            headers=_headers(token),
            json={"base_tree": base_tree_sha, "tree": tree_entries},
        )
        tree_resp.raise_for_status()
        new_tree_sha = tree_resp.json()["sha"]

        commit_resp = httpx.post(
            f"{repo_path}/git/commits",
            headers=_headers(token),
            json={
                "message": message,
                "tree": new_tree_sha,
                "parents": [base_sha],
            },
        )
        commit_resp.raise_for_status()
        new_sha = commit_resp.json()["sha"]

        ref_resp = httpx.patch(
            f"{repo_path}/git/refs/heads/{branch_name}",
            headers=_headers(token),
            json={"sha": new_sha},
        )
        ref_resp.raise_for_status()

        return f"Committed {len(file_list)} file(s) to {branch_name} (sha: {new_sha[:8]}): {message}"
    except Exception as exc:
        return f"Error committing: {exc}"


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
    token, org, base_url = _get_github_context()
    if token == "dev-token":
        return f"[dev-mode] PR created: {title} from {branch_name}"

    try:
        resp = httpx.post(
            f"{base_url}/repos/{org}/{repo_name}/pulls",
            headers=_headers(token),
            json={
                "title": title,
                "body": body,
                "head": branch_name,
                "base": "main",
            },
        )
        resp.raise_for_status()
        pr_data = resp.json()
        return f"PR #{pr_data['number']} created: {pr_data['html_url']}"
    except Exception as exc:
        return f"Error creating PR: {exc}"


@tool
def get_file_contents(repo_name: str, file_path: str, branch: str = "main") -> str:
    """Read a file from the GitHub repository.

    Args:
        repo_name: Repository name within the SWEAAS org.
        file_path: Path to the file within the repo.
        branch: Branch to read from.

    Returns:
        File contents (decoded from base64).
    """
    token, org, base_url = _get_github_context()
    if token == "dev-token":
        return f"[dev-mode] Would read {file_path} from {repo_name}:{branch}"

    try:
        resp = httpx.get(
            f"{base_url}/repos/{org}/{repo_name}/contents/{file_path}",
            headers=_headers(token),
            params={"ref": branch},
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("encoding") == "base64":
            import base64
            return base64.b64decode(data["content"]).decode("utf-8")
        return data.get("content", "")
    except Exception as exc:
        return f"Error reading file: {exc}"
