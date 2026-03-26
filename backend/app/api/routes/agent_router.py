"""Agent endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.dependencies import get_agent_service
from app.schemas.agent_schema import AgentActivity, AgentDetail, AgentSummary
from app.services.agent_service import AgentService

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentSummary])
def list_agents(agent_service: AgentService = Depends(get_agent_service)) -> list[AgentSummary]:
    return agent_service.list_agents()


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(
    agent_id: str,
    agent_service: AgentService = Depends(get_agent_service),
) -> AgentDetail:
    agent = agent_service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent


@router.get("/{agent_id}/activity", response_model=list[AgentActivity])
def list_agent_activity(
    agent_id: str,
    agent_service: AgentService = Depends(get_agent_service),
) -> list[AgentActivity]:
    agent = agent_service.get_agent(agent_id)
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found.")
    return agent_service.list_activity(agent_id)
