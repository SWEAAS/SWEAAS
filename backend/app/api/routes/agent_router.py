"""Agent endpoints — directory, status, activity, and chat."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.middleware.auth import AuthenticatedUser, get_current_user
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
def list_agents(
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> list[AgentSummary]:
    """List all agents with summary status."""
    return agent_service.list_agents()


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(
    agent_id: str,
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentDetail:
    """Get detailed info for a specific agent."""
    agent = agent_service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent


@router.get("/{agent_id}/activity", response_model=list[AgentActivity])
def list_agent_activity(
    agent_id: str,
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> list[AgentActivity]:
    """List recent activity for a specific agent."""
    agent = agent_service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent_service.list_activity(agent_id)


@router.post("/{agent_id}/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    agent_id: str,
    request: AgentChatRequest,
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    agent_service: Annotated[AgentService, Depends(get_agent_service)],
) -> AgentChatResponse:
    """Send a message to an agent, injecting context for its next task.

    This endpoint is used from both the dashboard and the 3D HQ chat panel.
    """
    agent = agent_service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return await agent_service.chat(agent_id, request)
