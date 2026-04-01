"""GitHub App webhook endpoint — receives push and pull_request events."""

import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github", tags=["github"])


def _verify_signature(body: bytes, signature_header: str | None) -> None:
    """Validate GitHub's X-Hub-Signature-256 HMAC header.

    Raises HTTP 401 if the secret is configured and the signature does not match.
    Skips verification when GITHUB_WEBHOOK_SECRET is empty (local dev without a tunnel).
    """
    settings = get_settings()
    secret = settings.github_webhook_secret.strip()
    if not secret:
        logger.debug("GITHUB_WEBHOOK_SECRET unset — skipping signature check")
        return

    if not signature_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Hub-Signature-256 header.",
        )

    expected = "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook signature mismatch.",
        )


@router.post("/webhook", status_code=200)
async def github_webhook(
    request: Request,
    x_github_event: str | None = Header(default=None, alias="X-GitHub-Event"),
    x_hub_signature_256: str | None = Header(
        default=None, alias="X-Hub-Signature-256"
    ),
) -> dict:
    """Receive GitHub App webhook events (push, pull_request, ping, etc.).

    This endpoint is public (no user JWT required) so GitHub can POST to it.
    Signature is verified via GITHUB_WEBHOOK_SECRET when configured.
    """
    body = await request.body()
    _verify_signature(body, x_hub_signature_256)

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload."
        ) from exc

    event = x_github_event or "unknown"
    repo = payload.get("repository", {}).get("full_name", "(unknown)")
    logger.info("GitHub event=%s repo=%s", event, repo)

    if event == "ping":
        return {"status": "pong", "zen": payload.get("zen", "")}

    if event == "push":
        branch = payload.get("ref", "").replace("refs/heads/", "")
        pusher = payload.get("pusher", {}).get("name", "")
        commits = len(payload.get("commits", []))
        logger.info("Push to %s branch=%s by %s (%d commits)", repo, branch, pusher, commits)
        return {"status": "received", "event": event, "repo": repo, "branch": branch}

    if event == "pull_request":
        action = payload.get("action", "")
        pr_num = payload.get("number", "")
        title = payload.get("pull_request", {}).get("title", "")
        logger.info("PR #%s %s — %s in %s", pr_num, action, title, repo)
        return {"status": "received", "event": event, "repo": repo, "pr": pr_num, "action": action}

    logger.debug("Unhandled event type: %s", event)
    return {"status": "ignored", "event": event}
