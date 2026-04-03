"""Unit tests for GitHubService — repo creation and collaborator management."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.github_service import GitHubService


# ---------------------------------------------------------------------------
# Dev-mode fallback (no GitHub App credentials)
# ---------------------------------------------------------------------------

class TestDevModeFallback:
    """When github_app_id is empty the service returns stub responses."""

    def _make_service(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.github_service.settings.github_app_id", ""
        )
        monkeypatch.setattr(
            "app.services.github_service.settings.github_app_private_key_path", ""
        )
        return GitHubService()

    def test_create_repository_dev_mode(self, monkeypatch):
        svc = self._make_service(monkeypatch)
        result = asyncio.run(svc.create_repository("my-repo"))
        assert result["_dev_mode"] is True
        assert result["name"] == "my-repo"
        assert "html_url" in result

    def test_create_repository_dev_mode_private_flag(self, monkeypatch):
        svc = self._make_service(monkeypatch)
        result = asyncio.run(svc.create_repository("r", private=False))
        assert result["private"] is False

    def test_add_collaborator_dev_mode(self, monkeypatch):
        svc = self._make_service(monkeypatch)
        result = asyncio.run(svc.add_collaborator("repo", "octocat"))
        assert result["_dev_mode"] is True
        assert result["username"] == "octocat"


# ---------------------------------------------------------------------------
# Real (App token) path — httpx calls are mocked
# ---------------------------------------------------------------------------

def _mock_installation_token(monkeypatch, token="inst-token-123"):
    """Patch _get_installation_token to return a known token."""
    monkeypatch.setattr(
        "app.services.github_service.settings.github_app_id", "12345"
    )
    monkeypatch.setattr(
        "app.services.github_service.settings.github_app_private_key_path",
        "/fake/key.pem",
    )
    monkeypatch.setattr(
        "app.services.github_service.settings.github_org_name", "TestOrg"
    )
    async_token = AsyncMock(return_value=token)
    monkeypatch.setattr(GitHubService, "_get_installation_token", async_token)
    return async_token


class TestCreateRepository:

    def test_calls_github_api(self, monkeypatch):
        _mock_installation_token(monkeypatch)

        fake_response = MagicMock()
        fake_response.json.return_value = {
            "id": 1,
            "name": "new-repo",
            "full_name": "TestOrg/new-repo",
        }
        fake_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=fake_response)

            svc = GitHubService()
            result = asyncio.run(svc.create_repository("new-repo"))

        assert result["name"] == "new-repo"
        instance.post.assert_called_once()
        call_args = instance.post.call_args
        assert "/orgs/TestOrg/repos" in call_args[0][0]
        assert call_args[1]["json"]["name"] == "new-repo"

    def test_raises_on_http_error(self, monkeypatch):
        _mock_installation_token(monkeypatch)

        fake_response = MagicMock()
        fake_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "422", request=MagicMock(), response=MagicMock()
        )

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=fake_response)

            svc = GitHubService()
            with pytest.raises(httpx.HTTPStatusError):
                asyncio.run(svc.create_repository("bad-repo"))


class TestAddCollaborator:

    def test_calls_collaborator_endpoint(self, monkeypatch):
        _mock_installation_token(monkeypatch)

        fake_response = MagicMock()
        fake_response.json.return_value = {}
        fake_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.put = AsyncMock(return_value=fake_response)

            svc = GitHubService()
            result = asyncio.run(
                svc.add_collaborator("repo", "alice", permission="admin")
            )

        assert result["status"] == "invited"
        assert result["username"] == "alice"
        call_args = instance.put.call_args
        assert "/collaborators/alice" in call_args[0][0]
        assert call_args[1]["json"]["permission"] == "admin"

    def test_raises_on_http_error(self, monkeypatch):
        _mock_installation_token(monkeypatch)

        fake_response = MagicMock()
        fake_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=MagicMock()
        )

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.put = AsyncMock(return_value=fake_response)

            svc = GitHubService()
            with pytest.raises(httpx.HTTPStatusError):
                asyncio.run(svc.add_collaborator("repo", "ghost"))


# ---------------------------------------------------------------------------
# _get_installation_token with real JWT flow
# ---------------------------------------------------------------------------

class TestGetInstallationToken:

    def test_returns_dev_token_when_credentials_missing(self, monkeypatch):
        monkeypatch.setattr("app.services.github_service.settings.github_app_id", "")
        monkeypatch.setattr(
            "app.services.github_service.settings.github_app_private_key_path", ""
        )
        svc = GitHubService()
        token = asyncio.run(svc._get_installation_token())
        assert token == "dev-token"

    def test_jwt_flow(self, monkeypatch, tmp_path):
        """Full JWT flow: read key -> build JWT -> call installations -> get token."""
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        key_file = tmp_path / "key.pem"
        key_file.write_bytes(pem)

        monkeypatch.setattr(
            "app.services.github_service.settings.github_app_id", "99"
        )
        monkeypatch.setattr(
            "app.services.github_service.settings.github_app_private_key_path",
            str(key_file),
        )

        installations_resp = MagicMock()
        installations_resp.json.return_value = [{"id": 555}]
        installations_resp.raise_for_status = MagicMock()

        token_resp = MagicMock()
        token_resp.json.return_value = {"token": "ghs_real_token"}
        token_resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get = AsyncMock(return_value=installations_resp)
            instance.post = AsyncMock(return_value=token_resp)

            svc = GitHubService()
            token = asyncio.run(svc._get_installation_token())

        assert token == "ghs_real_token"
        instance.get.assert_called_once()
        instance.post.assert_called_once()
        assert "/installations/555/access_tokens" in instance.post.call_args[0][0]
