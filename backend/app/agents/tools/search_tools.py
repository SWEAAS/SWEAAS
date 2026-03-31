"""LangChain tools for ChromaDB semantic search over agent memory and code."""

from langchain_core.tools import tool


@tool
def search_agent_memory(project_id: str, query: str, n_results: int = 5) -> str:
    """Search agent memories for relevant past decisions, lessons, and context.

    Args:
        project_id: Project ID to scope the search.
        query: Natural language query.
        n_results: Number of results to return.

    Returns:
        JSON string of matching memory entries.
    """
    import json

    from app.core.config import get_settings

    settings = get_settings()

    try:
        import chromadb

        client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        safe_id = project_id.replace("-", "")[:32]
        collection = client.get_collection(name=f"sweaas_memory_{safe_id}")
        results = collection.query(query_texts=[query], n_results=n_results)
        return json.dumps(results["documents"][0]) if results["documents"] else "[]"
    except Exception as exc:
        return f"Memory search unavailable: {exc}"


@tool
def search_codebase(project_id: str, query: str, n_results: int = 5) -> str:
    """Semantic search over indexed codebase files for a project.

    Args:
        project_id: Project ID to scope the search.
        query: Natural language query about code.
        n_results: Number of code chunks to return.

    Returns:
        JSON string of matching code chunks.
    """
    import json

    from app.core.config import get_settings

    settings = get_settings()

    try:
        import chromadb

        client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        safe_id = project_id.replace("-", "")[:32]
        collection = client.get_collection(name=f"sweaas_code_{safe_id}")
        results = collection.query(query_texts=[query], n_results=n_results)
        entries = []
        for i, doc in enumerate(results["documents"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            entries.append({"file": meta.get("file_path", "unknown"), "content": doc})
        return json.dumps(entries)
    except Exception as exc:
        return f"Code search unavailable: {exc}"
