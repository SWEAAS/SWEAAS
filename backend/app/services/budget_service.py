"""Domain logic for budget tracking, token consumption, and Stripe billing."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import select

from app.core.config import get_settings
from app.core.llm_budget import budget_tracker
from app.models.agent import AgentConfig
from app.models.project import ProjectConfig
from app.schemas.budget_schema import (
    AgentBudgetSnapshot,
    BudgetEstimateRequest,
    BudgetEstimateResponse,
    BudgetSummaryResponse,
    StripeCheckoutResponse,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
settings = get_settings()

_alerted_agents: set[str] = set()


class BudgetService:
    """Token consumption tracking and budget estimation using database-backed agents."""

    async def get_summary(self, db: "AsyncSession", project_id: UUID | None = None) -> BudgetSummaryResponse:
        stmt = select(AgentConfig)
        if project_id:
            stmt = stmt.where(AgentConfig.project_id == project_id)
        result = await db.execute(stmt)
        agents = result.scalars().all()

        agent_snapshots = [self._build_snapshot(agent) for agent in agents]
        total_budget = sum(s.token_budget for s in agent_snapshots)
        total_used = sum(s.tokens_used for s in agent_snapshots)
        consumption_pct = (
            round((total_used / total_budget) * 100, 2) if total_budget else 0.0
        )

        monthly_budget_usd = 0.0
        if project_id:
            cfg_result = await db.execute(
                select(ProjectConfig).where(ProjectConfig.project_id == project_id)
            )
            project_config = cfg_result.scalar_one_or_none()
            if project_config:
                monthly_budget_usd = project_config.monthly_budget_usd or 0.0

        return BudgetSummaryResponse(
            total_monthly_budget_usd=monthly_budget_usd,
            total_tokens_consumed=total_used,
            total_token_budget=total_budget,
            consumption_percent=consumption_pct,
            agents=agent_snapshots,
        )

    async def check_budget_thresholds_and_notify(
        self,
        user_id: UUID,
        org_id: UUID,
        project_id: str | None,
        db: "AsyncSession",
    ) -> None:
        from app.services.notification_service import NotificationService

        notification_service = NotificationService()

        stmt = select(AgentConfig)
        if project_id:
            stmt = stmt.where(AgentConfig.project_id == UUID(project_id))
        result = await db.execute(stmt)

        for agent in result.scalars().all():
            snapshot = self._build_snapshot(agent)
            alert_key = f"{agent.id}:{snapshot.usage_percent:.0f}"

            if snapshot.usage_percent >= 85.0 and alert_key not in _alerted_agents:
                _alerted_agents.add(alert_key)
                try:
                    await notification_service.notify_budget_threshold(
                        user_id=user_id,
                        org_id=org_id,
                        project_id=project_id,
                        agent_name=agent.name,
                        usage_percent=snapshot.usage_percent,
                        db=db,
                    )
                except Exception:
                    logger.warning(
                        "Failed to send budget notification for agent %s",
                        agent.id,
                        exc_info=True,
                    )

    def estimate_budget(self, request: BudgetEstimateRequest) -> BudgetEstimateResponse:
        profile_multiplier = {"light": 18_000, "balanced": 36_000, "heavy": 60_000}[
            request.usage_profile
        ]
        estimated_monthly_tokens = request.seat_count * profile_multiplier * 30
        estimated_cost = round(estimated_monthly_tokens / 1_000_000 * 12.5, 2)
        daily_budget = max(
            int((request.monthly_budget_usd * 80) / request.seat_count), 1_000,
        )

        notes = [
            "Keep 15-20% of the monthly budget in reserve for spikes.",
            "Warnings trigger when any agent exceeds 85% of its daily allocation.",
        ]
        if estimated_cost > request.monthly_budget_usd:
            notes.append(
                "Estimated spend exceeds the submitted budget — reduce scope or intensity."
            )

        return BudgetEstimateResponse(
            recommended_plan=f"{request.usage_profile.title()} automation rollout",
            estimated_monthly_tokens=estimated_monthly_tokens,
            estimated_cost_usd=estimated_cost,
            projected_daily_budget_per_agent=daily_budget,
            notes=notes,
        )

    async def get_agent_consumption(self, db: "AsyncSession", agent_id: UUID) -> AgentBudgetSnapshot | None:
        agent = await db.get(AgentConfig, agent_id)
        if agent is None:
            return None
        return self._build_snapshot(agent)

    async def create_checkout_session(
        self, project_id: str, price_id: str
    ) -> StripeCheckoutResponse:
        if not settings.stripe_secret_key:
            # Never return a fake URL — the user would land on a 404. Surface
            # the misconfiguration so the caller can show a real error.
            from fastapi import HTTPException
            raise HTTPException(
                status_code=503,
                detail=(
                    "Billing is not configured. Set STRIPE_SECRET_KEY on the "
                    "backend to enable checkout."
                ),
            )

        import stripe

        stripe.api_key = settings.stripe_secret_key
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=(
                "https://app.sweaas.dev/billing/success?session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url="https://app.sweaas.dev/billing/cancel",
            metadata={"project_id": project_id},
        )
        return StripeCheckoutResponse(checkout_url=session.url, session_id=session.id)

    def _build_snapshot(self, agent: AgentConfig) -> AgentBudgetSnapshot:
        aid = str(agent.id)
        live = budget_tracker.get_snapshot(aid) if budget_tracker.is_initialised else None

        if live:
            tokens_used = live["tokens_used_today"]
            token_budget = live["daily_token_budget"]
            strike_count = live["strike_count"]
        else:
            tokens_used = agent.tokens_used_today
            token_budget = agent.daily_token_budget
            strike_count = agent.strike_count

        usage_pct = round((tokens_used / token_budget) * 100, 2) if token_budget else 0.0

        if usage_pct >= 100:
            status = "exhausted"
        elif usage_pct >= 85:
            status = "warning"
        else:
            status = "healthy"

        if strike_count > 0 and status == "exhausted":
            status = "strike"

        return AgentBudgetSnapshot(
            agent_id=aid,
            name=agent.name,
            token_budget=token_budget,
            tokens_used=tokens_used,
            usage_percent=usage_pct,
            strike_count=strike_count,
            status=status,
        )

    def handle_stripe_webhook_event(self, event: dict[str, Any]) -> str:
        etype = event.get("type", "")
        eid = event.get("id", "")
        obj = (event.get("data") or {}).get("object") or {}
        logger.info("Stripe webhook type=%s id=%s", etype, eid)
        if etype == "checkout.session.completed" and obj.get("mode") == "subscription":
            meta = obj.get("metadata") or {}
            logger.info(
                "Stripe checkout completed session=%s subscription=%s customer=%s project_id=%s",
                obj.get("id"),
                obj.get("subscription"),
                obj.get("customer"),
                meta.get("project_id"),
            )
        return f"ok:{etype}"
