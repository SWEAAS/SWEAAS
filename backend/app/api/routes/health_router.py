"""Health check endpoints."""

from fastapi import APIRouter

from app.schemas.common_schema import MessageResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=MessageResponse)
def health_check() -> MessageResponse:
    """Basic liveness check."""
    return MessageResponse(message="ok")
