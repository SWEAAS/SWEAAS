"""Unit tests for GreptileService — codebase indexing and semantic queries."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.greptile_service import GreptileService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _configured_service(monkeypatch, api_key="grp-test-key"):
    monkeypatch.setattr(
        "app.services.greptile_service.settings.greptile_api_key", api_key
    )
    monkeypatch.setattr(
        "app.services.greptile_service.settings.github_org_name", "TestOrg"
    )
    monkeypatch.setattr(
        "app.services.greptile_service.settings.greptile_merge_threshold", 0.8
    )
    svc = GreptileService()
    svc._api_key = api_key
    svc._github_token = "gh-token"
    return svc


def _make_response(json_body, status_code=200):
    resp = MagicMock()
    resp.json.return_value = json_body
    resp.status_code = status_code
    resp.raise_for_status = MagicMock()
    return resp


# ---------------------------------------------------------------------------
# Unconfigured (no API key)
# ---------------------------------------------------------------------------

class TestUnconfigured:

    def test_index_repository_skipped(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.greptile_service.settings.greptile_api_key", ""
        )
        svc = GreptileService()
        result = asyncio.run(svc.index_repository("repo"))
        assert result["status"] == "skipped"

    def test_query_returns_empty(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.greptile_service.settings.greptile_api_key", ""
        )
        svc = GreptileService()
        result = asyncio.run(svc.query("repo", "What does main do?"))
        assert result["sources"] == []

    def test_search_returns_empty(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.greptile_service.settings.greptile_api_key", ""
        )
        svc = GreptileService()
        result = asyncio.run(svc.search("repo", "auth"))
        assert result["files"] == []

    def test_review_pr_skipped(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.greptile_service.settings.greptile_api_key", ""
        )
        svc = GreptileService()
        result = asyncio.run(svc.review_pull_request("repo", 42))
        assert result["decision"] == "skip"


# ---------------------------------------------------------------------------
# index_repository
# ---------------------------------------------------------------------------

class TestIndexRepository:

    def test_posts_to_repositories_endpoint(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        resp = _make_response({"status": "indexing", "sha": "abc"})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.index_repository("my-repo", branch="develop"))

        assert result["status"] == "indexing"
        call_args = instance.post.call_args
        assert "/repositories" in call_args[0][0]
        payload = call_args[1]["json"]
        assert payload["repository"] == "TestOrg/my-repo"
        assert payload["branch"] == "develop"


# ---------------------------------------------------------------------------
# query
# ---------------------------------------------------------------------------

class TestQuery:

    def test_posts_question(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        resp = _make_response({"message": "The main function...", "sources": [{"file": "main.py"}]})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.query("repo", "What does main do?"))

        assert "main" in result["message"].lower()
        payload = instance.post.call_args[1]["json"]
        assert payload["messages"][0]["content"] == "What does main do?"

    def test_includes_session_id(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        resp = _make_response({"message": "ok", "sources": []})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            asyncio.run(svc.query("repo", "q", session_id="sess-123"))

        payload = instance.post.call_args[1]["json"]
        assert payload["sessionId"] == "sess-123"


# ---------------------------------------------------------------------------
# search
# ---------------------------------------------------------------------------

class TestSearch:

    def test_posts_search_query(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        resp = _make_response({"files": [{"path": "auth.py"}]})

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=resp)
            result = asyncio.run(svc.search("repo", "authentication"))

        assert len(result["files"]) == 1
        payload = instance.post.call_args[1]["json"]
        assert payload["query"] == "authentication"


# ---------------------------------------------------------------------------
# review_pull_request
# ---------------------------------------------------------------------------

class TestReviewPullRequest:

    def test_merge_when_score_above_threshold(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        review_resp = _make_response({
            "message": "Good code. Score: 0.9 out of 1.0",
            "sources": [],
        })

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=review_resp)
            result = asyncio.run(svc.review_pull_request("repo", 7))

        assert result["decision"] == "merge"
        assert result["score"] == 0.9

    def test_needs_revision_when_below_threshold(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        review_resp = _make_response({
            "message": "Issues found. Score: 0.4 / 1.0",
            "sources": [],
        })

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=review_resp)
            result = asyncio.run(svc.review_pull_request("repo", 8, merge_threshold=0.7))

        assert result["decision"] == "needs_revision"
        assert result["score"] == 0.4
        assert result["threshold"] == 0.7

    def test_custom_threshold_overrides_settings(self, monkeypatch):
        svc = _configured_service(monkeypatch)
        review_resp = _make_response({
            "message": "quality: 0.6",
            "sources": [],
        })

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(return_value=review_resp)
            result = asyncio.run(
                svc.review_pull_request("repo", 9, merge_threshold=0.5)
            )

        assert result["decision"] == "merge"

    def test_exception_returns_manual_review(self, monkeypatch):
        svc = _configured_service(monkeypatch)

        with patch("httpx.AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.post = AsyncMock(
                side_effect=httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())
            )
            result = asyncio.run(svc.review_pull_request("repo", 10))

        assert result["decision"] == "manual_review"
        assert result["score"] == 0.0


# ---------------------------------------------------------------------------
# _extract_score
# ---------------------------------------------------------------------------

class TestExtractScore:

    @pytest.mark.parametrize(
        "text,expected",
        [
            ("Score: 0.85", 0.85),
            ("quality: 0.72", 0.72),
            ("0.9 / 1.0", 0.9),
            ("0.65 out of 1", 0.65),
            ("no numeric score here", 0.7),
            ("Score: 8.5", 0.85),
        ],
    )
    def test_patterns(self, text, expected):
        assert GreptileService._extract_score(text) == pytest.approx(expected, abs=0.01)
