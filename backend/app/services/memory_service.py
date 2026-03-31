"""ChromaDB-backed memory service for agent long-term memory and codebase RAG."""

import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class MemoryService:
    """Manages per-project ChromaDB collections for agent memory and code indexing.

    Each project gets its own collection namespace to enforce data isolation.
    """

    def __init__(self) -> None:
        self._client = None

    def _get_client(self):
        """Lazy-init ChromaDB HTTP client."""
        if self._client is None:
            try:
                import chromadb

                self._client = chromadb.HttpClient(
                    host=settings.chroma_host,
                    port=settings.chroma_port,
                )
            except Exception as exc:
                logger.warning("ChromaDB unavailable: %s", exc)
        return self._client

    def _collection_name(self, project_id: str, namespace: str = "memory") -> str:
        safe_id = project_id.replace("-", "")[:32]
        return f"sweaas_{namespace}_{safe_id}"

    async def store_memory(
        self, project_id: str, agent_id: str, content: str, memory_type: str = "context"
    ) -> str:
        """Embed and store a memory entry for an agent."""
        client = self._get_client()
        if client is None:
            return "chromadb-unavailable"

        collection = client.get_or_create_collection(
            name=self._collection_name(project_id),
        )
        doc_id = f"{agent_id}-{memory_type}-{collection.count()}"
        collection.add(
            documents=[content],
            ids=[doc_id],
            metadatas=[{"agent_id": agent_id, "memory_type": memory_type}],
        )
        return doc_id

    async def search_memory(
        self, project_id: str, query: str, n_results: int = 5
    ) -> list[dict]:
        """Semantic search across agent memories for a project."""
        client = self._get_client()
        if client is None:
            return []

        try:
            collection = client.get_collection(
                name=self._collection_name(project_id),
            )
        except Exception:
            return []

        results = collection.query(query_texts=[query], n_results=n_results)
        entries = []
        for i, doc in enumerate(results["documents"][0]):
            entries.append({
                "id": results["ids"][0][i],
                "content": doc,
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results.get("distances") else None,
            })
        return entries

    async def index_codebase(self, project_id: str, files: dict[str, str]) -> int:
        """Index code files into a project-specific collection for RAG retrieval.

        Args:
            files: Mapping of file_path -> file_content
        Returns:
            Number of chunks indexed.
        """
        client = self._get_client()
        if client is None:
            return 0

        collection = client.get_or_create_collection(
            name=self._collection_name(project_id, namespace="code"),
        )

        chunk_count = 0
        for path, content in files.items():
            chunks = self._chunk_code(content)
            for i, chunk in enumerate(chunks):
                doc_id = f"code-{path}-{i}"
                collection.add(
                    documents=[chunk],
                    ids=[doc_id],
                    metadatas=[{"file_path": path, "chunk_index": i}],
                )
                chunk_count += 1
        return chunk_count

    def _chunk_code(self, content: str, max_lines: int = 50) -> list[str]:
        """Split source code into overlapping chunks by line count."""
        lines = content.split("\n")
        chunks = []
        overlap = 10
        for start in range(0, len(lines), max_lines - overlap):
            chunk = "\n".join(lines[start : start + max_lines])
            if chunk.strip():
                chunks.append(chunk)
        return chunks
