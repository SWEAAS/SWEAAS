"""Agent endpoints — directory, status, activity, and chat."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.middleware.auth import AuthenticatedUser, get_current_user
from app.core.database import get_db
from app.core.dependencies import get_agent_service
from app.schemas.agent_schema import (
    AgentActivity,
    AgentChatRequest,
    AgentChatResponse,
    AgentDetail,
    AgentSummary,
)
from app.services.agent_service import AgentService

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentSummary])
async def list_agents(
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    project_id: UUID | None = Query(default=None),
) -> list[AgentSummary]:
    """List all agents with summary status, optionally scoped to a project."""
    return await agent_service.list_agents(db, project_id=project_id)


@router.get("/{agent_id}", response_model=AgentDetail)
async def get_agent(
    agent_id: UUID,
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentDetail:
    """Get detailed info for a specific agent."""
    agent = await agent_service.get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent


@router.get("/{agent_id}/activity", response_model=list[AgentActivity])
async def list_agent_activity(
    agent_id: UUID,
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AgentActivity]:
    """List recent activity for a specific agent."""
    agent = await agent_service.get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return await agent_service.list_activity(db, agent_id)


@router.post("/{agent_id}/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    agent_id: UUID,
    request: AgentChatRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AgentChatResponse:
    """Send a message to an agent, injecting context for its next task."""
    agent = await agent_service.get_agent(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return await agent_service.chat(db, agent_id, request)
