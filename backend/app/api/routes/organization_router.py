"""Organization endpoints — list, create, switch, rename.

The user/organization/project hierarchy mirrors GitHub: a user belongs to
many organizations (via :class:`OrganizationMember`) and each organization
owns many projects. ``User.organization_id`` is the *current* org the caller
has selected — projects/onboarding/agents all scope to it.
"""

import logging
import re
import uuid
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.user_provisioning import ensure_db_user
from app.models.user import Organization, OrganizationMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    role: str = "member"
    is_current: bool = False


class OrganizationCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class OrganizationUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


def _slug_from_name(name: str) -> str:
    """Turn 'Acme Robotics, Inc.' into 'acme-robotics-inc'. Truncated to 90 chars."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return (base or "org")[:90]


async def _unique_slug(db: AsyncSession, name: str) -> str:
    """Pick a unique org slug derived from the supplied name."""
    base = _slug_from_name(name)
    # Fast path: check the plain slug first.
    stmt = select(Organization.id).where(Organization.slug == base)
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        return base
    # Fallback: append a short uuid fragment so retries are deterministic.
    return f"{base}-{uuid.uuid4().hex[:8]}"


@router.get("", response_model=list[OrganizationResponse])
async def list_organizations(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrganizationResponse]:
    """List every org the caller belongs to, flagging the current one."""
    db_user = await ensure_db_user(db, user)
    stmt = (
        select(OrganizationMember, Organization)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == db_user.id)
        .order_by(OrganizationMember.joined_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        OrganizationResponse(
            id=str(org.id),
            name=org.name,
            slug=org.slug,
            role=member.role,
            is_current=(db_user.organization_id == org.id),
        )
        for member, org in rows
    ]


@router.post("", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    payload: OrganizationCreateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    """Create a new organization and make the caller its owner + active org.

    The caller is added to the new org via :class:`OrganizationMember` with
    ``role='owner'`` and ``User.organization_id`` is flipped so subsequent
    project / onboarding / agent requests scope to the new org. Their prior
    orgs stay in the membership table — switching back is a PATCH below.
    """
    db_user = await ensure_db_user(db, user)
    name = payload.name.strip()
    slug = await _unique_slug(db, name)

    org = Organization(name=name, slug=slug)
    db.add(org)
    await db.flush()

    membership = OrganizationMember(
        user_id=db_user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(membership)
    # Switch the caller's active org to the one they just created.
    db_user.organization_id = org.id

    try:
        await db.commit()
        await db.refresh(org)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Organization slug already taken — try a different name.")

    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        role="owner",
        is_current=True,
    )


@router.post("/{org_id}/switch", response_model=OrganizationResponse)
async def switch_organization(
    org_id: UUID,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    """Set the caller's current org. Only orgs they're a member of are allowed."""
    db_user = await ensure_db_user(db, user)
    stmt = (
        select(OrganizationMember, Organization)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .where(
            OrganizationMember.user_id == db_user.id,
            OrganizationMember.organization_id == org_id,
        )
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=403, detail="Not a member of this organization.")
    member, org = row
    db_user.organization_id = org.id
    await db.commit()
    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        role=member.role,
        is_current=True,
    )


@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: UUID,
    request: OrganizationUpdateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrganizationResponse:
    """Rename an organization (owner/admin only)."""
    db_user = await ensure_db_user(db, user)
    stmt = select(OrganizationMember).where(
        OrganizationMember.user_id == db_user.id,
        OrganizationMember.organization_id == org_id,
    )
    member = (await db.execute(stmt)).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=403, detail="Not a member of this organization.")
    if member.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners/admins can rename organizations.")

    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found.")

    org.name = request.name.strip()
    await db.commit()
    await db.refresh(org)

    return OrganizationResponse(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        role=member.role,
        is_current=(db_user.organization_id == org.id),
    )
