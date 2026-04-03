"""Top-level LangGraph definition — the hierarchical agent orchestration graph.

Architecture:
  CTO (supervisor)
    -> budget gate
    -> conditional routing -> Department Managers -> Specialists
    -> aggregator (collects all results)
    -> CTO review (direction report)
    -> END

The graph enforces deterministic communication:
  - Tasks flow DOWN from CTO to managers to specialists
  - Results flow UP from specialists through the aggregator to CTO review
  - No cross-department lateral communication without CTO mediation
  - Budget exhaustion triggers the "strike" mechanism (skips to aggregator)
"""

import logging

from langgraph.graph import END, Send, StateGraph
from langgraph.graph.state import CompiledStateGraph

from app.agents.nodes.aggregator import aggregator_node
from app.agents.nodes.cto import cto_node
from app.agents.nodes.cto_review import cto_review_node
from app.agents.nodes.engineering_manager import engineering_manager_node
from app.agents.nodes.marketing_manager import marketing_manager_node
from app.agents.nodes.product_manager import product_manager_node
from app.agents.nodes.specialists.backend_architect import backend_architect_node
from app.agents.nodes.specialists.devops import devops_node
from app.agents.nodes.specialists.frontend_dev import frontend_dev_node
from app.agents.nodes.specialists.growth_analyst import growth_analyst_node
from app.agents.nodes.specialists.product_ops import product_ops_node
from app.agents.nodes.specialists.qa_tester import qa_tester_node
from app.agents.state import AgentState

logger = logging.getLogger(__name__)


async def _passthrough_node(state: AgentState) -> dict:
    """No-op routing node used as a fan-out point after budget check."""
    return {}


def _check_budget(state: AgentState) -> str:
    """Budget gate after CTO decomposition. Returns 'strike' or 'continue'."""
    remaining = state.get("budget_remaining", 100_000)
    if remaining <= 0:
        logger.warning("Budget exhausted — entering strike state")
        return "strike"
    return "continue"


def _route_after_budget(state: AgentState) -> list[Send]:
    """After budget check passes, fan out to department managers via Send()."""
    subtasks = state.get("subtasks", [])
    departments = {s.get("department") for s in subtasks}

    targets = []
    if "engineering" in departments:
        targets.append("engineering_manager")
    if "product" in departments:
        targets.append("product_manager")
    if "marketing" in departments:
        targets.append("marketing_manager")

    if not targets:
        targets = ["engineering_manager"]

    return [Send(target, state) for target in targets]


def _route_after_eng_manager(state: AgentState) -> list[Send]:
    """Route to engineering specialists based on manager assignments via Send()."""
    assignments = state.get("assignments", [])
    specialists_needed = set()
    for a in assignments:
        spec = a.get("specialist", "")
        if spec in ("frontend_dev", "backend_architect", "devops", "qa_tester"):
            specialists_needed.add(spec)

    if not specialists_needed:
        specialists_needed = {"backend_architect"}

    return [Send(target, state) for target in specialists_needed]


async def _budget_strike_node(state: AgentState) -> dict:
    """Node when budget is exhausted — reports strike and moves to aggregator."""
    logger.warning("Budget strike for project %s", state.get("project_id", "unknown"))
    return {
        "current_agent": "budget_strike",
        "status": "budget_exhausted",
        "results": [{
            "agent": "budget_strike",
            "output": "Budget exhausted. No specialist work performed this session.",
        }],
        "messages": [{
            "role": "system",
            "content": "Session halted: token budget exhausted (strike).",
        }],
    }


def build_agent_graph(project_id: str | None = None) -> CompiledStateGraph:
    """Construct the hierarchical agent graph.

    Returns a compiled LangGraph ready for execution via ainvoke().
    """
    graph = StateGraph(AgentState)

    # ── Nodes ──
    graph.add_node("cto", cto_node)
    graph.add_node("budget_gate", _passthrough_node)
    graph.add_node("budget_strike", _budget_strike_node)
    graph.add_node("engineering_manager", engineering_manager_node)
    graph.add_node("product_manager", product_manager_node)
    graph.add_node("marketing_manager", marketing_manager_node)
    graph.add_node("frontend_dev", frontend_dev_node)
    graph.add_node("backend_architect", backend_architect_node)
    graph.add_node("devops", devops_node)
    graph.add_node("qa_tester", qa_tester_node)
    graph.add_node("product_ops", product_ops_node)
    graph.add_node("growth_analyst", growth_analyst_node)
    graph.add_node("aggregator", aggregator_node)
    graph.add_node("cto_review", cto_review_node)

    # ── Entry ──
    graph.set_entry_point("cto")

    # ── CTO -> budget gate ──
    graph.add_conditional_edges(
        "cto",
        _check_budget,
        {
            "strike": "budget_strike",
            "continue": "budget_gate",
        },
    )

    # Budget gate fans out to department managers via Send()
    graph.add_conditional_edges("budget_gate", _route_after_budget)

    # ── Budget strike -> aggregator ──
    graph.add_edge("budget_strike", "aggregator")

    # ── Engineering Manager -> Specialists (parallel fan-out via Send) ──
    graph.add_conditional_edges("engineering_manager", _route_after_eng_manager)

    # ── Product/Marketing -> their specialists ──
    graph.add_edge("product_manager", "product_ops")
    graph.add_edge("marketing_manager", "growth_analyst")

    # ── All specialists -> aggregator ──
    graph.add_edge("frontend_dev", "aggregator")
    graph.add_edge("backend_architect", "aggregator")
    graph.add_edge("devops", "aggregator")
    graph.add_edge("qa_tester", "aggregator")
    graph.add_edge("product_ops", "aggregator")
    graph.add_edge("growth_analyst", "aggregator")

    # ── Aggregator -> CTO Review -> END ──
    graph.add_edge("aggregator", "cto_review")
    graph.add_edge("cto_review", END)

    compiled = graph.compile()
    logger.info("Agent graph compiled for project %s", project_id)
    return compiled
