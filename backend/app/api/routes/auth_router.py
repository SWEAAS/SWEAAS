"""Authentication endpoints — proxy to Supabase Auth."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.schemas.auth_schema import UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserProfile)
async def get_profile(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> UserProfile:
    """Return the profile of the currently authenticated user.

    The actual signup/login flow is handled directly by the Supabase
    client SDK on the frontend. This endpoint lets the backend verify
    the JWT and return enriched profile data.
    """
    return UserProfile(
        uid=user.uid,
        email=user.email,
        full_name="",
        github_username="",
        role=user.role,
    )
