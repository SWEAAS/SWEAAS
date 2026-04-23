"""GitHub App API integration — repo creation and collaborator management."""

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class GitHubService:
    """Manages GitHub repositories via the GitHub App installation API.

    Authentication flow:
      1. Generate a JWT from the App's private key
      2. Exchange the JWT for an installation access token
      3. Use the token for org-level repo and collaborator operations
    """

    def __init__(self) -> None:
        self._org = settings.github_org_name
        self._base_url = "https://api.github.com"

    async def _get_installation_token(self) -> str:
        """Obtain a short-lived installation access token.

        In production this uses JWT signed with the App private key.
        Returns a placeholder in dev mode when credentials are absent or the
        private key file is unreadable (so downstream flows can degrade
        gracefully instead of 500ing on repo creation).
        """
        if not settings.github_app_id or not settings.github_app_private_key_path:
            logger.warning("GitHub App credentials not configured — returning dev token.")
            return "dev-token"

        # In production: build JWT, call /app/installations, then POST access_tokens
        # See: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
        import time

        import jwt as pyjwt

        try:
            with open(settings.github_app_private_key_path) as f:
                private_key = f.read()
        except OSError as exc:
            logger.warning(
                "GitHub App private key unreadable at %s (%s) — degrading to dev token.",
                settings.github_app_private_key_path,
                exc,
            )
            return "dev-token"

        now = int(time.time())
        payload = {
            "iat": now - 60,
            "exp": now + (10 * 60),
            "iss": settings.github_app_id,
        }
        encoded_jwt = pyjwt.encode(payload, private_key, algorithm="RS256")

        async with httpx.AsyncClient() as client:
            # Get installation ID
            resp = await client.get(
                f"{self._base_url}/app/installations",
                headers={
                    "Authorization": f"Bearer {encoded_jwt}",
                    "Accept": "application/vnd.github+json",
                },
            )
            resp.raise_for_status()
            installations = resp.json()
            installation_id = installations[0]["id"]

            # Get access token
            resp = await client.post(
                f"{self._base_url}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {encoded_jwt}",
                    "Accept": "application/vnd.github+json",
                },
            )
            resp.raise_for_status()
            return resp.json()["token"]

    async def create_repository(self, repo_name: str, private: bool = True) -> dict:
        """Create a new repository under the SWEAAS organization."""
        token = await self._get_installation_token()
        if token == "dev-token":
            return {
                "name": repo_name,
                "full_name": f"{self._org}/{repo_name}",
                "html_url": f"https://github.com/{self._org}/{repo_name}",
                "private": private,
                "_dev_mode": True,
            }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self._base_url}/orgs/{self._org}/repos",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
                json={
                    "name": repo_name,
                    "private": private,
                    "auto_init": True,
                    "description": f"SWEAAS managed project: {repo_name}",
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def add_collaborator(
        self, repo_name: str, github_username: str, permission: str = "push"
    ) -> dict:
        """Invite a GitHub user as a collaborator on the project repo."""
        token = await self._get_installation_token()
        if token == "dev-token":
            return {"status": "invited", "username": github_username, "_dev_mode": True}

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{self._base_url}/repos/{self._org}/{repo_name}/collaborators/{github_username}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
                json={"permission": permission},
            )
            resp.raise_for_status()
            return {"status": "invited", "username": github_username}
