"""Project management endpoints — CRUD, GitHub repo, and Sentry provisioning."""

import logging
import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_github_service, get_greptile_service, get_sentry_service
from app.models.project import Project
from app.models.user import User
from app.schemas.project_schema import ProjectCreateRequest, ProjectResponse
from app.services.github_service import GitHubService
from app.services.greptile_service import GreptileService
from app.services.sentry_service import SentryService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


async def _resolve_org_id(user: AuthenticatedUser, db: AsyncSession) -> UUID:
    """Look up the user's organization from the DB."""
    stmt = select(User.organization_id).where(User.supabase_uid == user.uid)
    result = await db.execute(stmt)
    org_id = result.scalar_one_or_none()
    if org_id is None:
        raise HTTPException(
            status_code=400,
            detail="User is not associated with an organization.",
        )
    return org_id


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    request: ProjectCreateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    github_service: Annotated[GitHubService, Depends(get_github_service)],
    greptile_service: Annotated[GreptileService, Depends(get_greptile_service)],
    sentry_service: Annotated[SentryService, Depends(get_sentry_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    """Create a new project, provision GitHub repo, Greptile index, and Sentry project.

    Steps:
      1. Create a GitHub org repo
      2. Index the repo with Greptile (async — continues in background)
      3. Create a Sentry project + retrieve DSN
      4. Link the GitHub repo to Sentry for commit tracking
      5. Persist the project to the database
      6. Optionally add the user as a GitHub collaborator
    """
    org_id = await _resolve_org_id(user, db)
    slug = re.sub(r"[^a-z0-9-]", "-", request.name.lower()).strip("-")[:100]
    repo_name = f"project-{slug}"

    repo = await github_service.create_repository(repo_name, private=True)
    repo_url = repo.get("html_url")

    try:
        await greptile_service.index_repository(repo_name)
    except Exception:
        logger.warning(
            "Greptile indexing failed for %s — continuing without it",
            repo_name,
            exc_info=True,
        )

    sentry_slug: str | None = None
    sentry_dsn: str | None = None
    try:
        sentry_proj = await sentry_service.create_project(
            name=request.name, slug=slug,
        )
        sentry_slug = sentry_proj.get("slug", slug)
        if sentry_proj.get("id"):
            sentry_dsn = await sentry_service.get_client_dsn(sentry_slug)
            await sentry_service.link_repository(repo_name)
    except Exception:
        logger.warning(
            "Sentry provisioning failed for project %s — continuing without it",
            slug,
            exc_info=True,
        )

    project = Project(
        organization_id=org_id,
        name=request.name,
        slug=slug,
        description=request.description,
        github_repo_name=repo_name,
        github_repo_url=repo_url,
        sentry_project_slug=sentry_slug,
        sentry_dsn=sentry_dsn,
        status="active",
    )
    db.add(project)
    await db.flush()

    if request.github_username:
        await github_service.add_collaborator(repo_name, request.github_username)

    return ProjectResponse(
        id=str(project.id),
        name=project.name,
        slug=project.slug,
        description=project.description,
        github_repo_url=project.github_repo_url,
        sentry_project_slug=project.sentry_project_slug,
        sentry_dsn=project.sentry_dsn,
        public_token=project.public_token,
        status=project.status,
        created_at=project.created_at.isoformat() if project.created_at else "",
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProjectResponse]:
    """List all projects for the authenticated user's organization."""
    org_id = await _resolve_org_id(user, db)
    stmt = select(Project).where(Project.organization_id == org_id)
    result = await db.execute(stmt)
    projects = result.scalars().all()
    return [
        ProjectResponse(
            id=str(p.id),
            name=p.name,
            slug=p.slug,
            description=p.description or "",
            github_repo_url=p.github_repo_url,
            sentry_project_slug=p.sentry_project_slug,
            sentry_dsn=p.sentry_dsn,
            public_token=p.public_token,
            status=p.status,
            created_at=p.created_at.isoformat() if p.created_at else "",
        )
        for p in projects
    ]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectResponse:
    """Get details for a specific project."""
    org_id = await _resolve_org_id(user, db)
    stmt = select(Project).where(
        Project.id == project_id,
        Project.organization_id == org_id,
    )
    result = await db.execute(stmt)
    p = result.scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(
        id=str(p.id),
        name=p.name,
        slug=p.slug,
        description=p.description or "",
        github_repo_url=p.github_repo_url,
        sentry_project_slug=p.sentry_project_slug,
        sentry_dsn=p.sentry_dsn,
        public_token=p.public_token,
        status=p.status,
        created_at=p.created_at.isoformat() if p.created_at else "",
    )
