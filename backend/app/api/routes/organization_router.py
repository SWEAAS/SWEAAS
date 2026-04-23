"""Organization endpoints — list and update user organizations."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.user_provisioning import ensure_db_user
from app.models.user import Organization, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str


class OrganizationUpdateRequest(BaseModel):
    name: str


@router.get("", response_model=list[OrganizationResponse])
async def list_organizations(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrganizationResponse]:
    """List organizations the current user belongs to.

    Auto-provisions the user + org on first authenticated hit so a fresh
    Supabase signup sees their org here without first calling /auth/me.
    """
    db_user = await ensure_db_user(db, user)
    if not db_user.organization_id:
        return []

    org = await db.get(Organization, db_user.organization_id)
    if org is None:
        return []

    return [OrganizationResponse(id=str(org.id), name=org.name, slug=org.slug)]


@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: UUID,
    request: OrganizationUpdateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    """Rename an organization (owner/admin only)."""
    stmt = select(User).where(User.supabase_uid == user.uid)
    db_user = (await db.execute(stmt)).scalar_one_or_none()
    if not db_user or str(db_user.organization_id) != str(org_id):
        raise HTTPException(status_code=403, detail="Not authorized for this organization.")
    if db_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can rename organizations.")

    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org.name = request.name.strip()
    await db.commit()
    await db.refresh(org)

    return OrganizationResponse(id=str(org.id), name=org.name, slug=org.slug)
