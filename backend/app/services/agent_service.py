"""Domain logic for agent directory, status, and chat relay."""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import llm_completion, llm_has_credentials
from app.models.agent import AgentConfig, AgentSession
from app.schemas.agent_schema import (
    AgentActivity,
    AgentChatRequest,
    AgentChatResponse,
    AgentDetail,
    AgentSummary,
)

logger = logging.getLogger(__name__)

CUSTOMER_SUPPORT_AGENT_ID = "sup-cs-01"

_DEPT_CONTEXT = {
    "engineering": (
        "You are a software engineer at SWEAAS, an AI-powered SWE-as-a-service platform. "
        "You write and review code, manage GitHub repos, fix bugs caught by Sentry, and "
        "collaborate with product and marketing teams. Keep answers concise and technical."
    ),
    "marketing": (
        "You are a marketing professional at SWEAAS. You run growth campaigns, analyse "
        "metrics, produce copy, and coordinate with the product team on launches. "
        "Keep answers strategic and action-oriented."
    ),
    "product": (
        "You are a product manager at SWEAAS. You own the roadmap, gather user feedback, "
        "write specs, and bridge engineering and business stakeholders. "
        "Keep answers crisp and outcome-focused."
    ),
    "support": (
        "You are a customer success specialist at SWEAAS. You help end users resolve issues, "
        "collect feedback, and escalate product bugs. Keep answers empathetic and clear."
    ),
}


def _build_system_prompt(agent: AgentConfig) -> str:
    dept_ctx = _DEPT_CONTEXT.get(agent.department, "")
    focus = agent.current_focus or ""
    return (
        f"You are {agent.name}, a {agent.role.replace('_', ' ')} at SWEAAS. "
        f"{dept_ctx}\n\n"
        f"Your current focus: {focus}\n\n"
        "Respond in first person as this agent. Be helpful, concise, and stay in character. "
        "You can discuss what you are working on, give technical opinions, and accept "
        "guidance about your next task."
    )


def _agent_to_summary(agent: AgentConfig) -> AgentSummary:
    return AgentSummary(
        agent_id=str(agent.id),
        name=agent.name,
        role=agent.role,
        department=agent.department,
        hierarchy_level=agent.hierarchy_level or "specialist",
        status=agent.status or "active",
        daily_token_budget=agent.daily_token_budget,
        tokens_used_today=agent.tokens_used_today,
        current_focus=agent.current_focus or "",
        parent_agent_id=str(agent.parent_agent_id) if agent.parent_agent_id else None,
        replica_id=agent.replica_id,
        poster_image_url=agent.poster_image_url,
        thumbnail_video_url=agent.thumbnail_video_url,
    )


class AgentService:
    """Provides agent directory, activity data, and chat relay using the database."""

    async def list_agents(self, db: AsyncSession, project_id: UUID | None = None) -> list[AgentSummary]:
        stmt = select(AgentConfig)
        if project_id:
            stmt = stmt.where(AgentConfig.project_id == project_id)
        stmt = stmt.order_by(AgentConfig.created_at)
        result = await db.execute(stmt)
        return [_agent_to_summary(agent) for agent in result.scalars().all()]

    async def get_agent(self, db: AsyncSession, agent_id: UUID) -> AgentDetail | None:
        agent = await db.get(AgentConfig, agent_id)
        if agent is None:
            return None

        sessions = await db.execute(
            select(AgentSession)
            .where(AgentSession.agent_id == agent.id)
            .order_by(AgentSession.started_at.desc())
            .limit(10)
        )
        activities = [
            AgentActivity(
                agent_id=str(agent.id),
                activity_id=str(s.id),
                title=f"Session {s.status}",
                detail=f"Sandbox: {s.sandbox_id or 'local'}",
                state="running" if s.status == "running" else "completed",
                started_at=s.started_at.isoformat() if s.started_at else "",
            )
            for s in sessions.scalars().all()
        ]

        return AgentDetail(
            agent_id=str(agent.id),
            name=agent.name,
            role=agent.role,
            department=agent.department,
            hierarchy_level=agent.hierarchy_level or "specialist",
            status=agent.status or "active",
            daily_token_budget=agent.daily_token_budget,
            tokens_used_today=agent.tokens_used_today,
            current_focus=agent.current_focus or "",
            description=agent.description or "",
            strike_count=agent.strike_count,
            parent_agent_id=str(agent.parent_agent_id) if agent.parent_agent_id else None,
            email=agent.email,
            pronouns=agent.pronouns,
            location=agent.location,
            timezone=agent.timezone,
            start_date=agent.start_date.isoformat() if agent.start_date else None,
            recent_activity=activities,
            replica_id=agent.replica_id,
            poster_image_url=agent.poster_image_url,
            thumbnail_video_url=agent.thumbnail_video_url,
        )

    async def list_activity(self, db: AsyncSession, agent_id: UUID) -> list[AgentActivity]:
        sessions = await db.execute(
            select(AgentSession)
            .where(AgentSession.agent_id == agent_id)
            .order_by(AgentSession.started_at.desc())
            .limit(20)
        )
        return [
            AgentActivity(
                agent_id=str(agent_id),
                activity_id=str(s.id),
                title=f"Session {s.status}",
                detail=f"Sandbox: {s.sandbox_id or 'local'}",
                state="running" if s.status == "running" else "completed",
                started_at=s.started_at.isoformat() if s.started_at else "",
            )
            for s in sessions.scalars().all()
        ]

    async def chat(self, db: AsyncSession, agent_id: UUID, request: AgentChatRequest) -> AgentChatResponse:
        agent = await db.get(AgentConfig, agent_id)
        if agent is None or not llm_has_credentials():
            return AgentChatResponse(
                agent_id=str(agent_id),
                response=f"[{agent_id}] Acknowledged: {request.message[:100]}",
                context_injected=False,
            )

        system_prompt = _build_system_prompt(agent)
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

        for h in request.history:
            messages.append({"role": h.role, "content": h.content})

        messages.append({"role": "user", "content": request.message})

        try:
            result = await llm_completion(messages=messages, agent_id=str(agent_id))
            return AgentChatResponse(
                agent_id=str(agent_id),
                response=result.content,
                context_injected=True,
            )
        except Exception:
            logger.exception("LLM chat failed for agent %s", agent_id)
            return AgentChatResponse(
                agent_id=str(agent_id),
                response="I'm temporarily unavailable. Please try again in a moment.",
                context_injected=False,
            )
