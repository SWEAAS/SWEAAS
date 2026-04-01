"""Greptile API integration — codebase indexing and semantic code queries."""

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_BASE_URL = "https://api.greptile.com/v2"


class GreptileService:
    """Indexes customer repos with Greptile and provides semantic code queries.

    Greptile builds a full dependency graph of each repo, enabling:
    - Automatic PR review with full codebase context
    - Natural-language code queries for AI agents
    - Code search across indexed repositories
    """

    def __init__(self) -> None:
        self._api_key = settings.greptile_api_key
        self._github_token = ""
        self._org = settings.github_org_name

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "X-GitHub-Token": self._github_token,
            "Content-Type": "application/json",
        }

    @property
    def _configured(self) -> bool:
        return bool(self._api_key)

    async def index_repository(self, repo_name: str, branch: str = "main") -> dict[str, Any]:
        """Submit a repository for indexing by Greptile.

        Call this after GitHubService.create_repository() so Greptile
        builds its code graph and starts auto-reviewing PRs.
        Indexing takes 3-5 min for small repos, longer for large ones.
        """
        if not self._configured:
            logger.warning("Greptile API key not configured — skipping repo indexing")
            return {"status": "skipped", "reason": "greptile_api_key not set"}

        full_repo = f"{self._org}/{repo_name}"
        logger.info("Indexing repository %s with Greptile", full_repo)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_BASE_URL}/repositories",
                headers=self._headers(),
                json={
                    "remote": "github",
                    "repository": full_repo,
                    "branch": branch,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info("Greptile indexing started for %s: %s", full_repo, data)
            return data

    async def get_repository_info(self, repo_name: str, branch: str = "main") -> dict[str, Any]:
        """Check indexing status of a repository."""
        if not self._configured:
            return {"status": "skipped"}

        repo_id = f"github:{branch}:{self._org}/{repo_name}"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/repositories/{repo_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    async def query(
        self,
        repo_name: str,
        question: str,
        *,
        branch: str = "main",
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """Ask a natural-language question about a codebase.

        Used by AI agents to understand code before making changes.
        """
        if not self._configured:
            return {"message": "Greptile not configured", "sources": []}

        full_repo = f"{self._org}/{repo_name}"
        payload: dict[str, Any] = {
            "messages": [{"role": "user", "content": question}],
            "repositories": [
                {"remote": "github", "repository": full_repo, "branch": branch},
            ],
        }
        if session_id:
            payload["sessionId"] = session_id

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{_BASE_URL}/query",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def search(
        self,
        repo_name: str,
        query: str,
        *,
        branch: str = "main",
    ) -> dict[str, Any]:
        """Search for code across a repository.

        Returns relevant files and code snippets matching the query.
        """
        if not self._configured:
            return {"files": [], "message": "Greptile not configured"}

        full_repo = f"{self._org}/{repo_name}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_BASE_URL}/search",
                headers=self._headers(),
                json={
                    "query": query,
                    "repositories": [
                        {"remote": "github", "repository": full_repo, "branch": branch},
                    ],
                },
            )
            resp.raise_for_status()
            return resp.json()
