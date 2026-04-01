"""Per-agent budget tracking backed by in-memory counters and PostgreSQL.

Counters are hydrated from seed data (or later from ``AgentConfig`` rows) on
startup and reset daily.  Every LLM call that passes through
:func:`app.core.llm.llm_completion` records usage here.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.core.llm import LLMResult

logger = logging.getLogger(__name__)

DAY_SECONDS = 86_400


class BudgetExhaustedError(Exception):
    """Raised when an agent's daily token budget has been exhausted."""

    def __init__(self, agent_id: str, used: int, limit: int) -> None:
        self.agent_id = agent_id
        self.used = used
        self.limit = limit
        super().__init__(
            f"Agent {agent_id!r} exhausted daily budget: "
            f"{used:,}/{limit:,} tokens used"
        )


@dataclass
class AgentBudgetEntry:
    """In-memory counters for one agent."""

    agent_id: str
    name: str
    daily_token_budget: int
    tokens_used_today: int = 0
    cost_usd_today: float = 0.0
    strike_count: int = 0
    reset_at: float = 0.0


class BudgetTracker:
    """Singleton-style tracker initialised once at app startup."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentBudgetEntry] = {}
        self._initialised = False

    @property
    def is_initialised(self) -> bool:
        return self._initialised

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------
    def init_budgets(self, agents: list[dict[str, Any]]) -> None:
        """Populate from seed data / DB rows.

        Each *agent* dict must have at least ``agent_id``, ``name``, and
        ``daily_token_budget``.
        """
        now = time.time()
        next_reset = now + DAY_SECONDS
        for agent in agents:
            aid = agent["agent_id"]
            self._agents[aid] = AgentBudgetEntry(
                agent_id=aid,
                name=agent["name"],
                daily_token_budget=agent["daily_token_budget"],
                tokens_used_today=0,
                cost_usd_today=0.0,
                strike_count=agent.get("strike_count", 0),
                reset_at=next_reset,
            )
        self._initialised = True
        logger.info("BudgetTracker initialised for %d agents", len(self._agents))

    # ------------------------------------------------------------------
    # Pre-call gate
    # ------------------------------------------------------------------
    def check_budget(self, agent_id: str) -> None:
        """Raise :class:`BudgetExhaustedError` if the agent is over budget."""
        entry = self._agents.get(agent_id)
        if entry is None:
            return
        self._maybe_reset(entry)
        if entry.tokens_used_today >= entry.daily_token_budget:
            entry.strike_count += 1
            raise BudgetExhaustedError(
                agent_id, entry.tokens_used_today, entry.daily_token_budget,
            )

    # ------------------------------------------------------------------
    # Post-call recording
    # ------------------------------------------------------------------
    async def record_usage(self, agent_id: str, result: LLMResult) -> None:
        """Update in-memory counters and persist a ``TokenUsageLog`` row."""
        entry = self._agents.get(agent_id)
        if entry is not None:
            self._maybe_reset(entry)
            entry.tokens_used_today += result.total_tokens
            entry.cost_usd_today += result.cost_usd

        await self._persist_log(agent_id, result)

    # ------------------------------------------------------------------
    # Snapshot for BudgetService / API
    # ------------------------------------------------------------------
    def get_snapshot(self, agent_id: str) -> dict[str, Any] | None:
        entry = self._agents.get(agent_id)
        if entry is None:
            return None
        self._maybe_reset(entry)
        return {
            "agent_id": entry.agent_id,
            "name": entry.name,
            "daily_token_budget": entry.daily_token_budget,
            "tokens_used_today": entry.tokens_used_today,
            "cost_usd_today": entry.cost_usd_today,
            "strike_count": entry.strike_count,
        }

    def all_snapshots(self) -> list[dict[str, Any]]:
        return [self.get_snapshot(aid) for aid in self._agents]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _maybe_reset(self, entry: AgentBudgetEntry) -> None:
        """Reset counters if the daily window has elapsed."""
        if time.time() >= entry.reset_at:
            entry.tokens_used_today = 0
            entry.cost_usd_today = 0.0
            entry.reset_at = time.time() + DAY_SECONDS
            logger.info("Daily budget reset for agent %s", entry.agent_id)

    async def _persist_log(self, agent_id: str, result: LLMResult) -> None:
        """Write a ``TokenUsageLog`` row.  Failures are logged, never raised."""
        try:
            from app.core.database import async_session_factory
            from app.models.budget import TokenUsageLog

            async with async_session_factory() as session:
                log = TokenUsageLog(
                    agent_slug=agent_id,
                    model=result.model,
                    prompt_tokens=result.prompt_tokens,
                    completion_tokens=result.completion_tokens,
                    total_tokens=result.total_tokens,
                    cost_usd=result.cost_usd,
                )
                session.add(log)
                await session.commit()
        except Exception:
            logger.warning(
                "Failed to persist token usage log for agent=%s",
                agent_id, exc_info=True,
            )


# Module-level singleton
budget_tracker = BudgetTracker()
