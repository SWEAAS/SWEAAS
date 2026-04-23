"""First-hit user/org provisioning shared across routers.

The initial authenticated API call from a new Supabase user can hit ``/auth/me``
or any other ``/api/v1`` route. Every auth-gated endpoint therefore needs to
ensure a matching ``User`` + ``Organization`` row exists before it looks up the
user's org — otherwise the first login races (Header, Sidebar, dashboard
stores all fire in parallel) and some calls 400 with "User is not associated
with an organization."

This helper centralises the provisioning logic so every router can call it
safely. It is idempotent and handles the concurrent-insert race via
``IntegrityError`` + re-select.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser
from app.core.config import get_settings
from app.models.user import Organization, OrganizationMember, User

logger = logging.getLogger(__name__)


def _slug_fragment(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "org"


async def ensure_db_user(
    db: AsyncSession,
    user: AuthenticatedUser,
) -> User:
    """Return the DB ``User`` row for the authenticated caller, provisioning if needed.

    In dev mode (``AUTH_ENFORCE_JWT=false``) the dev user is seeded at startup,
    so this should find an existing row. In production, new Supabase users land
    here on their first authenticated request and get an Organization + User
    created atomically.

    Raises :class:`fastapi.HTTPException` with 400 if the caller has no ``uid``.
    """
    if not user.uid:
        raise HTTPException(
            status_code=400,
            detail="Authenticated request is missing a user identifier.",
        )

    result = await db.execute(select(User).where(User.supabase_uid == user.uid))
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing

    # In dev mode the startup hook provisions the dev user — if we ever land
    # here it means a concurrent startup race; fall through and let the normal
    # provisioning path create the record.
    if not get_settings().auth_enforce_jwt:
        logger.warning(
            "Dev user %s not found in DB — provisioning on demand", user.uid,
        )

    meta = user.jwt_payload.get("user_metadata") if user.jwt_payload else None
    if not isinstance(meta, dict):
        meta = {}

    email = (user.email or "").strip() or f"{user.uid}@users.sweaas.internal"
    raw_name = meta.get("full_name") or meta.get("name")
    full_name = str(raw_name).strip() if raw_name else ""
    if not full_name and email and "@" in email:
        full_name = email.split("@")[0]

    gh = meta.get("user_name") or meta.get("preferred_username") or meta.get("nickname")
    github_username = str(gh).strip() if gh else None

    base_slug = _slug_fragment(email.split("@")[0] if "@" in email else str(user.uid)[:12])
    org_slug = f"{base_slug}-{uuid.uuid4().hex[:10]}"
    username = email.split("@")[0] if "@" in email else str(user.uid)[:12]

    org = Organization(name=username, slug=org_slug)
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
    # Record the caller as an owner of their default org so it shows up in
    # ``GET /organizations`` and they can switch back after creating more.
    db.add(
        OrganizationMember(
            user_id=db_user.id,
            organization_id=org.id,
            role="owner",
        )
    )

    try:
        await db.commit()
        await db.refresh(db_user)
        logger.info("Provisioned app user for supabase uid %s", user.uid)
        return db_user
    except IntegrityError:
        # Concurrent first-login: another request created the row — fetch it.
        await db.rollback()
        result = await db.execute(select(User).where(User.supabase_uid == user.uid))
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to provision user on first login.",
            )
        return row


async def ensure_org_id(db: AsyncSession, user: AuthenticatedUser) -> UUID:
    """Return the caller's organization UUID, provisioning if needed."""
    db_user = await ensure_db_user(db, user)
    if db_user.organization_id is None:
        raise HTTPException(
            status_code=400,
            detail="User has no organization — please contact support.",
        )
    return db_user.organization_id
