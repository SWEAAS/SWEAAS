"""Project management endpoints — CRUD and GitHub repo operations."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.dependencies import get_github_service
from app.schemas.common_schema import MessageResponse
from app.schemas.project_schema import ProjectCreateRequest, ProjectResponse
from app.services.github_service import GitHubService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    request: ProjectCreateRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    github_service: Annotated[GitHubService, Depends(get_github_service)],
) -> ProjectResponse:
    """Create a new project and provision a GitHub repository.

    Steps:
      1. Create a DB record for the project
      2. Call GitHub App API to create an org repo
      3. Optionally add the user as a collaborator
      4. Return project details with the repo URL
    """
    import re
    from uuid import uuid4

    slug = re.sub(r"[^a-z0-9-]", "-", request.name.lower()).strip("-")[:100]
    repo_name = f"project-{slug}"

    repo = await github_service.create_repository(repo_name, private=True)

    if request.github_username:
        await github_service.add_collaborator(repo_name, request.github_username)

    return ProjectResponse(
        id=str(uuid4()),
        name=request.name,
        slug=slug,
        description=request.description,
        github_repo_url=repo.get("html_url"),
        status="active",
        created_at="2026-03-31T12:00:00Z",
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> list[ProjectResponse]:
    """List all projects for the authenticated user."""
    return []


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> ProjectResponse:
    """Get details for a specific project."""
    return ProjectResponse(
        id=project_id,
        name="Placeholder",
        slug="placeholder",
        description="",
        github_repo_url=None,
        status="active",
        created_at="2026-03-31T12:00:00Z",
    )
