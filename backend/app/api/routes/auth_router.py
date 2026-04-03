"""Authentication endpoints — Supabase JWT identity + app user provisioning."""

import logging
import re
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, decode_supabase_jwt, get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import Organization, User
from app.schemas.auth_schema import UserProfile

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _slug_fragment(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "org"


async def _ensure_db_user_for_jwt_user(
    db: AsyncSession,
    user: AuthenticatedUser,
    jwt_payload: dict[str, Any],
) -> User | None:
    """Create organization + users row on first authenticated API call (production).

    Supabase Auth issues the JWT; the app database stores org membership and profile fields.
    """
    result = await db.execute(select(User).where(User.supabase_uid == user.uid))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    meta = jwt_payload.get("user_metadata")
    if not isinstance(meta, dict):
        meta = {}

    email = (user.email or "").strip() or f"{user.uid}@users.sweaas.internal"
    raw_name = meta.get("full_name") or meta.get("name")
    full_name = str(raw_name).strip() if raw_name else ""
    if not full_name and user.email and "@" in user.email:
        full_name = user.email.split("@")[0]

    gh = meta.get("user_name") or meta.get("preferred_username") or meta.get("nickname")
    github_username = str(gh).strip() if gh else None

    base_slug = _slug_fragment(user.email.split("@")[0] if "@" in user.email else str(user.uid)[:12])
    org_slug = f"{base_slug}-{uuid.uuid4().hex[:10]}"

    org = Organization(
        name=(f"{full_name}'s workspace" if full_name else "Workspace"),
        slug=org_slug,
    )
    db.add(org)
    await db.flush()

    db_user = User(
        id=uuid.uuid4(),
        supabase_uid=user.uid,
        email=email,
        full_name=full_name or "",
        github_username=github_username,
        organization_id=org.id,
        role="owner",
    )
    db.add(db_user)

    try:
        await db.commit()
        await db.refresh(db_user)
        logger.info("Provisioned app user for supabase uid %s", user.uid)
        return db_user
    except IntegrityError:
        await db.rollback()
        result = await db.execute(select(User).where(User.supabase_uid == user.uid))
        return result.scalar_one_or_none()


@router.get("/me", response_model=UserProfile)
async def get_profile(
    request: Request,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    """Return the profile of the currently authenticated user.

    Enriches the JWT-derived identity with DB-stored fields (full_name,
    github_username) when a matching User row exists. When JWT enforcement
    is enabled and no row exists yet, creates an organization and user row.
    """
    result = await db.execute(
        select(User).where(User.supabase_uid == user.uid)
    )
    db_user = result.scalar_one_or_none()

    cfg = get_settings()
    jwt_payload: dict[str, Any] = {}
    if db_user is None and cfg.auth_enforce_jwt and user.uid:
        auth = request.headers.get("authorization") or ""
        parts = auth.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            try:
                jwt_payload = decode_supabase_jwt(parts[1])
            except Exception:
                jwt_payload = {}
        db_user = await _ensure_db_user_for_jwt_user(db, user, jwt_payload)

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
