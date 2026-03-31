"""User feedback — in-app API and webhooks from Intercom / Canny / Zendesk."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.dependencies import get_feedback_service
from app.schemas.feedback_schema import (
    FeedbackItemResponse,
    FeedbackListResponse,
    FeedbackSubmitRequest,
    FeedbackWebhookPayload,
)
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackItemResponse, status_code=201)
def submit_feedback(
    request: FeedbackSubmitRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[FeedbackService, Depends(get_feedback_service)],
) -> FeedbackItemResponse:
    """Submit product feedback. Items are stored and can be forwarded to agents via memory/RAG.

    Typical flow: user submits → `FeedbackService` stores → engineering/product agents
    pull from DB (or ChromaDB) on the next orchestration cycle.
    """
    return svc.submit(request)


@router.get("", response_model=FeedbackListResponse)
def list_feedback(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    svc: Annotated[FeedbackService, Depends(get_feedback_service)],
    project_id: str | None = Query(default=None),
) -> FeedbackListResponse:
    """List recent feedback for a project (or all if project omitted)."""
    return FeedbackListResponse(items=svc.list_for_project(project_id))


@router.post("/webhooks/intercom", response_model=FeedbackItemResponse)
def webhook_intercom(
    payload: FeedbackWebhookPayload,
    svc: Annotated[FeedbackService, Depends(get_feedback_service)],
    _x_webhook_secret: str | None = Header(default=None, alias="X-Webhook-Secret"),
) -> FeedbackItemResponse:
    """Ingest Intercom conversation exports or ticket creation webhooks.

    Secure with a shared secret in production (compare to INTERCOM_WEBHOOK_SECRET in config).
    """
    return svc.ingest_webhook(payload, provider="intercom")


@router.post("/webhooks/canny", response_model=FeedbackItemResponse)
def webhook_canny(
    payload: FeedbackWebhookPayload,
    svc: Annotated[FeedbackService, Depends(get_feedback_service)],
) -> FeedbackItemResponse:
    """Ingest Canny post/comment webhooks into the unified feedback store."""
    return svc.ingest_webhook(payload, provider="canny")
