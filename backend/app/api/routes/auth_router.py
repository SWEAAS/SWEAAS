"""Authentication endpoints — Supabase JWT identity + app user provisioning."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.user_provisioning import ensure_db_user
from app.schemas.auth_schema import UserProfile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserProfile)
async def get_profile(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    """Return the profile of the currently authenticated user.

    Auto-provisions an Organization + User row on the first authenticated
    request (see :mod:`app.core.user_provisioning`). Subsequent calls return
    the existing row with DB-stored fields (full_name, github_username,
    onboarding_completed).
    """
    db_user = await ensure_db_user(db, user)
    return UserProfile(
        uid=db_user.supabase_uid,
        email=db_user.email,
        full_name=db_user.full_name or "",
        github_username=db_user.github_username or "",
        role=db_user.role or user.role,
        onboarding_completed=db_user.onboarding_completed,
    )
