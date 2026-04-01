"""LangChain tools for querying Sentry error data per customer project."""

from langchain_core.tools import tool


@tool
def get_unresolved_issues(project_slug: str) -> str:
    """Fetch unresolved issues from Sentry for a specific project.

    Args:
        project_slug: Sentry project slug (from the customer project's
            ``sentry_project_slug`` field, NOT the global SWEAAS platform project).

    Returns:
        JSON string of unresolved issues.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.sentry_auth_token:
        return "[]"

    import httpx

    resp = httpx.get(
        f"https://sentry.io/api/0/projects/{settings.sentry_org}/{project_slug}/issues/",
        headers={"Authorization": f"Bearer {settings.sentry_auth_token}"},
        params={"query": "is:unresolved", "limit": 10},
    )
    if resp.status_code != 200:
        return f"Error: {resp.status_code}"
    return resp.text


@tool
def get_issue_events(issue_id: str) -> str:
    """Get the latest events (stack traces) for a Sentry issue.

    Args:
        issue_id: Sentry issue ID.

    Returns:
        JSON string of the latest events.
    """
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.sentry_auth_token:
        return "[]"

    import httpx

    resp = httpx.get(
        f"https://sentry.io/api/0/issues/{issue_id}/events/latest/",
        headers={"Authorization": f"Bearer {settings.sentry_auth_token}"},
    )
    if resp.status_code != 200:
        return f"Error: {resp.status_code}"
    return resp.text
