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
        self._github_token: str | None = None
        self._org = settings.github_org_name

    async def _resolve_github_token(self) -> str:
        """Lazily obtain a GitHub installation token for private repo access."""
        if self._github_token is not None:
            return self._github_token
        try:
            from app.services.github_service import GitHubService
            svc = GitHubService()
            self._github_token = await svc._get_installation_token()
        except Exception:
            self._github_token = ""
        return self._github_token

    async def _get_headers(self) -> dict[str, str]:
        token = await self._resolve_github_token()
        return {
            "Authorization": f"Bearer {self._api_key}",
            "X-GitHub-Token": token,
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

        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_BASE_URL}/repositories",
                headers=headers,
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
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/repositories/{repo_id}",
                headers=headers,
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

        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{_BASE_URL}/query",
                headers=headers,
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
        headers = await self._get_headers()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{_BASE_URL}/search",
                headers=headers,
                json={
                    "query": query,
                    "repositories": [
                        {"remote": "github", "repository": full_repo, "branch": branch},
                    ],
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def review_pull_request(
        self,
        repo_name: str,
        pr_number: int,
        *,
        branch: str = "main",
        merge_threshold: float | None = None,
    ) -> dict[str, Any]:
        """Review a pull request using Greptile's full codebase context.

        Returns a review with a quality score and merge recommendation.
        The CTO uses `merge_threshold` to decide merge vs reject.
        """
        if not self._configured:
            return {
                "decision": "skip",
                "score": 0.0,
                "reason": "Greptile not configured",
            }

        full_repo = f"{self._org}/{repo_name}"
        review_query = (
            f"Review pull request #{pr_number}. Assess code quality, "
            f"potential bugs, security issues, and adherence to best practices. "
            f"Rate the overall quality from 0.0 to 1.0."
        )

        try:
            result = await self.query(
                repo_name=repo_name,
                question=review_query,
                branch=branch,
            )

            message = result.get("message", "")
            score = self._extract_score(message)

            if merge_threshold is None:
                merge_threshold = settings.greptile_merge_threshold
            decision = "merge" if score >= merge_threshold else "needs_revision"
            return {
                "pr_number": pr_number,
                "decision": decision,
                "score": score,
                "threshold": merge_threshold,
                "review": message[:2000],
                "sources": result.get("sources", [])[:5],
            }
        except Exception as exc:
            logger.warning("Greptile PR review failed: %s", exc)
            return {
                "pr_number": pr_number,
                "decision": "manual_review",
                "score": 0.0,
                "reason": str(exc),
            }

    @staticmethod
    def _extract_score(review_text: str) -> float:
        """Extract a numeric quality score from the review text."""
        import re
        patterns = [
            r"(\d+\.?\d*)\s*/\s*1\.0",
            r"score[:\s]+(\d+\.?\d*)",
            r"quality[:\s]+(\d+\.?\d*)",
            r"(\d+\.?\d*)\s*out of\s*1",
        ]
        for pattern in patterns:
            match = re.search(pattern, review_text, re.IGNORECASE)
            if match:
                val = float(match.group(1))
                return min(val, 1.0) if val <= 1.0 else min(val / 10.0, 1.0)
        return 0.7
