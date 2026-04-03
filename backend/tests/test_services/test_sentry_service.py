"""Unit tests for SentryService — project provisioning and issue management."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.sentry_service import SentryService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_settings(**overrides):
    defaults = dict(
        sentry_auth_token="sntrys-test-token",
        sentry_org="test-org",
        sentry_team="test-team",
        sentry_project="sweaas",
        github_org_name="TestOrg",
    )
    defaults.update(overrides)
    return MagicMock(**defaults)


def _configured_service():
    svc = SentryService()
    svc._settings = _mock_settings()
    return svc


def _unconfigured_service():
    svc = SentryService()
    svc._settings = _mock_settings(
        sentry_auth_token="",
        sentry_org="",
        sentry_team="",
        sentry_project="",
        github_org_name="",
    )
    return svc


def _make_response(json_body, status_code=200):
    resp = MagicMock()
    resp.json.return_value = json_body
    resp.status_code = status_code
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# Unconfigured — graceful stubs
# ---------------------------------------------------------------------------

class TestUnconfigured:

    def test_create_project_returns_stub(self):
        svc = _unconfigured_service()
        result = asyncio.run(svc.create_project("proj", slug="proj-slug"))
        assert result["slug"] == "proj-slug"
        assert result["id"] is None

    def test_get_client_dsn_returns_none(self):
        svc = _unconfigured_service()
        result = asyncio.run(svc.get_client_dsn("proj"))
        assert result is None

    def test_list_issues_returns_empty(self):
        svc = _unconfigured_service()
        result = asyncio.run(svc.list_issues())
        assert result == []

    def test_create_release_returns_stub(self):
        svc = _unconfigured_service()
        result = asyncio.run(svc.create_release("proj", "v1.0", "repo", "abc"))
        assert result["version"] == "v1.0"

    def test_link_repository_returns_none(self):
        svc = _unconfigured_service()
        result = asyncio.run(svc.link_repository("repo"))
        assert result is None


# ---------------------------------------------------------------------------
# create_project
# ---------------------------------------------------------------------------

class TestCreateProject:

    def test_posts_to_teams_endpoint(self):
        svc = _configured_service()
        resp = _make_response({"slug": "my-proj", "id": "123456"})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.create_project("My Proj", slug="my-proj"))

        assert result["slug"] == "my-proj"
        assert result["id"] == "123456"
        call_url = instance.post.call_args[0][0]
        assert "/teams/test-org/test-team/projects/" in call_url

    def test_raises_on_http_error(self):
        svc = _configured_service()
        resp = MagicMock()
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "400", request=MagicMock(), response=MagicMock()
        )

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            with pytest.raises(httpx.HTTPStatusError):
                asyncio.run(svc.create_project("bad"))


# ---------------------------------------------------------------------------
# get_client_dsn
# ---------------------------------------------------------------------------

class TestGetClientDSN:

    def test_returns_dsn_string(self):
        svc = _configured_service()
        resp = _make_response({
            "dsn": {"public": "https://abc@sentry.io/123"},
        })

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            dsn = asyncio.run(svc.get_client_dsn("my-proj"))

        assert dsn == "https://abc@sentry.io/123"

    def test_returns_none_when_dsn_missing(self):
        svc = _configured_service()
        resp = _make_response({"dsn": {}})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            dsn = asyncio.run(svc.get_client_dsn("my-proj"))

        assert dsn is None


# ---------------------------------------------------------------------------
# list_issues
# ---------------------------------------------------------------------------

class TestListIssues:

    def test_returns_issues(self):
        svc = _configured_service()
        resp = _make_response([
            {"id": "1", "title": "NullPointerException"},
            {"id": "2", "title": "TimeoutError"},
        ])

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get = AsyncMock(return_value=resp)
            issues = asyncio.run(svc.list_issues("my-proj", limit=10))

        assert len(issues) == 2
        call_url = instance.get.call_args[0][0]
        assert "/projects/test-org/my-proj/issues/" in call_url

    def test_falls_back_to_platform_project(self):
        svc = _configured_service()
        resp = _make_response([])

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get = AsyncMock(return_value=resp)
            asyncio.run(svc.list_issues(project_slug=None))

        call_url = instance.get.call_args[0][0]
        assert "/sweaas/issues/" in call_url


# ---------------------------------------------------------------------------
# create_release
# ---------------------------------------------------------------------------

class TestCreateRelease:

    def test_posts_release_with_refs(self):
        svc = _configured_service()
        resp = _make_response({"version": "v1.2.3"})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(
                svc.create_release("proj", "v1.2.3", "repo", "abc123", prev_commit_sha="def456")
            )

        assert result["version"] == "v1.2.3"
        payload = instance.post.call_args[1]["json"]
        assert payload["version"] == "v1.2.3"
        assert payload["refs"][0]["commit"] == "abc123"
        assert payload["refs"][0]["previousCommit"] == "def456"


# ---------------------------------------------------------------------------
# link_repository
# ---------------------------------------------------------------------------

class TestLinkRepository:

    def test_posts_to_repos_endpoint(self):
        svc = _configured_service()
        resp = _make_response({"name": "TestOrg/repo", "provider": "github"})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.link_repository("repo"))

        assert result["name"] == "TestOrg/repo"
        call_url = instance.post.call_args[0][0]
        assert "/organizations/test-org/repos/" in call_url

    def test_handles_409_conflict(self):
        svc = _configured_service()
        resp = MagicMock()
        resp.status_code = 409
        resp.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.link_repository("repo"))

        assert result["status"] == "already_linked"
        resp.raise_for_status.assert_not_called()

    def test_raises_on_other_errors(self):
        svc = _configured_service()
        resp = MagicMock()
        resp.status_code = 500
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            with pytest.raises(httpx.HTTPStatusError):
                asyncio.run(svc.link_repository("repo"))
