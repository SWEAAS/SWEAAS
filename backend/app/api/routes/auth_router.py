"""Authentication endpoints — proxy to Supabase Auth."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth_schema import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserProfile)
async def get_profile(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    """Return the profile of the currently authenticated user.

    Enriches the JWT-derived identity with DB-stored fields (full_name,
    github_username) when a matching User row exists.
    """
    result = await db.execute(
        select(User).where(User.supabase_uid == user.uid)
    )
    db_user = result.scalar_one_or_none()

    if db_user:
        return UserProfile(
            uid=db_user.supabase_uid,
            email=db_user.email,
            full_name=db_user.full_name or "",
            github_username=db_user.github_username or "",
            role=db_user.role or user.role,
        )

    return UserProfile(
        uid=user.uid,
        email=user.email,
        full_name="",
        github_username="",
        role=user.role,
    )
