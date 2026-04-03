"""Unit tests for MemoryService."""

import asyncio
from unittest.mock import patch, MagicMock

import pytest

from app.services.memory_service import MemoryService


def _make_mock_collection(docs=None, ids=None, metadatas=None, distances=None):
    """Build a mock ChromaDB collection with configurable query results."""
    col = MagicMock()
    col.count.return_value = 0
    col.add = MagicMock()
    col.query.return_value = {
        "documents": [docs or []],
        "ids": [ids or []],
        "metadatas": [metadatas or []],
        "distances": [distances or []],
    }
    return col


def _make_mock_client(collection=None):
    """Build a mock chromadb.HttpClient."""
    client = MagicMock()
    col = collection or _make_mock_collection()
    client.get_or_create_collection.return_value = col
    client.get_collection.return_value = col
    return client


class TestStoreMemory:
    @patch("app.services.memory_service.chromadb", create=True)
    def test_stores_document(self, mock_chromadb):
        col = _make_mock_collection()
        mock_client = _make_mock_client(col)
        mock_chromadb.HttpClient.return_value = mock_client

        svc = MemoryService()
        svc._client = mock_client
        doc_id = asyncio.run(
            svc.store_memory("proj-1", "cto-01", "Some context", "context")
        )

        assert doc_id.startswith("cto-01-context-")
        col.add.assert_called_once()
        call_kwargs = col.add.call_args[1]
        assert call_kwargs["documents"] == ["Some context"]
        assert call_kwargs["metadatas"] == [
            {"agent_id": "cto-01", "memory_type": "context"}
        ]

    def test_returns_unavailable_when_no_client(self):
        svc = MemoryService()
        svc._client = None
        with patch.object(svc, "_get_client", return_value=None):
            doc_id = asyncio.run(
                svc.store_memory("proj-1", "agent-1", "data", "context")
            )
        assert doc_id == "chromadb-unavailable"


class TestSearchMemory:
    @patch("app.services.memory_service.chromadb", create=True)
    def test_returns_matching_entries(self, mock_chromadb):
        col = _make_mock_collection(
            docs=["Result 1", "Result 2"],
            ids=["id-1", "id-2"],
            metadatas=[{"agent_id": "a"}, {"agent_id": "b"}],
            distances=[0.1, 0.5],
        )
        mock_client = _make_mock_client(col)
        mock_chromadb.HttpClient.return_value = mock_client

        svc = MemoryService()
        svc._client = mock_client
        results = asyncio.run(svc.search_memory("proj-1", "search query", n_results=5))

        assert len(results) == 2
        assert results[0]["id"] == "id-1"
        assert results[0]["content"] == "Result 1"
        assert results[0]["distance"] == 0.1
        assert results[1]["metadata"] == {"agent_id": "b"}

        col.query.assert_called_once_with(
            query_texts=["search query"], n_results=5
        )

    def test_returns_empty_when_no_client(self):
        svc = MemoryService()
        svc._client = None
        with patch.object(svc, "_get_client", return_value=None):
            results = asyncio.run(svc.search_memory("proj-1", "query"))
        assert results == []

    @patch("app.services.memory_service.chromadb", create=True)
    def test_returns_empty_when_collection_not_found(self, mock_chromadb):
        mock_client = MagicMock()
        mock_client.get_collection.side_effect = Exception("Collection not found")
        mock_chromadb.HttpClient.return_value = mock_client

        svc = MemoryService()
        svc._client = mock_client
        results = asyncio.run(svc.search_memory("proj-1", "query"))
        assert results == []


class TestChromaUnavailable:
    @patch("app.services.memory_service.chromadb", create=True)
    def test_get_client_handles_exception(self, mock_chromadb):
        mock_chromadb.HttpClient.side_effect = Exception("Connection refused")
        svc = MemoryService()
        client = svc._get_client()
        assert client is None

    def test_store_memory_graceful(self):
        svc = MemoryService()
        with patch.object(svc, "_get_client", return_value=None):
            result = asyncio.run(
                svc.store_memory("proj-1", "agent-1", "content", "context")
            )
        assert result == "chromadb-unavailable"

    def test_search_memory_graceful(self):
        svc = MemoryService()
        with patch.object(svc, "_get_client", return_value=None):
            results = asyncio.run(svc.search_memory("proj-1", "query"))
        assert results == []


class TestCollectionName:
    def test_namespace_default(self):
        svc = MemoryService()
        name = svc._collection_name("my-project-123")
        assert name.startswith("sweaas_memory_")
        assert "-" not in name.split("sweaas_memory_")[1]

    def test_namespace_code(self):
        svc = MemoryService()
        name = svc._collection_name("proj-abc", namespace="code")
        assert name.startswith("sweaas_code_")

    def test_long_id_truncated(self):
        svc = MemoryService()
        long_id = "a" * 100
        name = svc._collection_name(long_id)
        safe_part = name.split("sweaas_memory_")[1]
        assert len(safe_part) <= 32


class TestChunkCode:
    def test_basic_chunking(self):
        svc = MemoryService()
        content = "\n".join(f"line {i}" for i in range(120))
        chunks = svc._chunk_code(content, max_lines=50)
        assert len(chunks) > 1
        for chunk in chunks:
            assert chunk.strip()

    def test_empty_content(self):
        svc = MemoryService()
        chunks = svc._chunk_code("")
        assert chunks == []

    def test_small_file_single_chunk(self):
        svc = MemoryService()
        content = "line 1\nline 2\nline 3"
        chunks = svc._chunk_code(content, max_lines=50)
        assert len(chunks) == 1
