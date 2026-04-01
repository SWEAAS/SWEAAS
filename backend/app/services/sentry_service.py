"""Sentry integration — project provisioning, issue querying, and release management.

SWEAAS owns a single Sentry organization.  When a customer project is created,
a corresponding Sentry project is auto-provisioned under ``SENTRY_TEAM`` so
that agents can monitor errors per customer project.
"""

import logging
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_BASE = "https://sentry.io/api/0"


class SentryService:
    """Wraps the Sentry REST API for per-project operations."""

    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._settings.sentry_auth_token}"}

    @property
    def _org(self) -> str:
        return self._settings.sentry_org

    # ------------------------------------------------------------------
    # Project lifecycle
    # ------------------------------------------------------------------
    async def create_project(
        self,
        name: str,
        slug: str | None = None,
        platform: str = "python",
    ) -> dict[str, Any]:
        """Create a Sentry project under the configured team.

        Returns the full project JSON from the API including ``slug`` and
        ``id``.  Gracefully returns a stub if Sentry is not configured.
        """
        if not self._settings.sentry_auth_token or not self._settings.sentry_team:
            logger.debug("Sentry not configured — skipping project creation")
            return {"slug": slug or name, "id": None}

        team = self._settings.sentry_team
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_BASE}/teams/{self._org}/{team}/projects/",
                headers=self._headers,
                json={"name": name, "slug": slug, "platform": platform},
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info("Created Sentry project %s (id=%s)", data["slug"], data["id"])
            return data

    async def get_client_dsn(self, project_slug: str) -> str | None:
        """Create a client key for a Sentry project and return the public DSN."""
        if not self._settings.sentry_auth_token:
            return None

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_BASE}/projects/{self._org}/{project_slug}/keys/",
                headers=self._headers,
                json={},
            )
            resp.raise_for_status()
            dsn = resp.json().get("dsn", {}).get("public")
            logger.info("Created DSN for Sentry project %s", project_slug)
            return dsn

    # ------------------------------------------------------------------
    # Issue querying (used by agents + observability dashboard)
    # ------------------------------------------------------------------
    async def list_issues(
        self,
        project_slug: str | None = None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Return unresolved issues for a Sentry project.

        Falls back to ``SENTRY_PROJECT`` (the SWEAAS platform project) when
        *project_slug* is ``None``.
        """
        if not self._settings.sentry_auth_token:
            return []

        slug = project_slug or self._settings.sentry_project
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_BASE}/projects/{self._org}/{slug}/issues/",
                headers=self._headers,
                params={"query": "is:unresolved", "limit": limit},
            )
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # Release + commit linking
    # ------------------------------------------------------------------
    async def create_release(
        self,
        project_slug: str,
        version: str,
        repo_name: str,
        commit_sha: str,
        prev_commit_sha: str | None = None,
    ) -> dict[str, Any]:
        """Create a release and associate commits."""
        if not self._settings.sentry_auth_token:
            return {"version": version}

        body: dict[str, Any] = {
            "version": version,
            "projects": [project_slug],
        }
        if repo_name and commit_sha:
            ref = f"{self._settings.github_org_name}/{repo_name}"
            commit_spec = {"repository": ref, "commit": commit_sha}
            if prev_commit_sha:
                commit_spec["previousCommit"] = prev_commit_sha
            body["refs"] = [commit_spec]

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_BASE}/organizations/{self._org}/releases/",
                headers=self._headers,
                json=body,
            )
            resp.raise_for_status()
            logger.info("Created Sentry release %s for %s", version, project_slug)
            return resp.json()

    async def link_repository(self, repo_name: str) -> dict[str, Any] | None:
        """Ensure a GitHub repository is known to Sentry for commit tracking.

        This calls the Sentry repository API to register the repo.  If the
        GitHub integration is installed in Sentry (recommended), repos are
        auto-discovered and this is a no-op.
        """
        if not self._settings.sentry_auth_token:
            return None

        full_name = f"{self._settings.github_org_name}/{repo_name}"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{_BASE}/organizations/{self._org}/repos/",
                headers=self._headers,
                json={"provider": "github", "identifier": full_name},
            )
            if resp.status_code == 409:
                logger.debug("Repo %s already linked to Sentry", full_name)
                return {"name": full_name, "status": "already_linked"}
            resp.raise_for_status()
            logger.info("Linked repo %s to Sentry org %s", full_name, self._org)
            return resp.json()
