"""Top-level LangGraph definition — the hierarchical agent orchestration graph.

Architecture:
  CTO (supervisor) -> conditional routing -> Department Managers -> Specialists

The graph enforces deterministic communication:
  - Tasks flow DOWN from CTO to managers to specialists
  - Results/feedback flow UP from specialists to managers to CTO
  - No cross-department lateral communication without CTO mediation
  - Budget exhaustion triggers the "strike" mechanism
"""

import logging

from langgraph.graph import END, StateGraph

from app.agents.nodes.cto import cto_node
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


def _route_after_cto(state: AgentState) -> list[str]:
    """Determine which manager nodes to activate based on CTO's subtask decomposition."""
    subtasks = state.get("subtasks", [])
    departments = {s.get("department") for s in subtasks}

    targets = []
    if "engineering" in departments:
        targets.append("engineering_manager")
    if "product" in departments:
        targets.append("product_manager")
    if "marketing" in departments:
        targets.append("marketing_manager")

    return targets if targets else ["engineering_manager"]


def _route_after_eng_manager(state: AgentState) -> list[str]:
    """Route to specific engineering specialists based on manager assignments."""
    # In a full implementation, this would parse the manager's JSON assignments.
    # For now, route to backend_architect as default.
    return ["backend_architect"]


def _check_budget(state: AgentState) -> str:
    """Check if budget is exhausted — triggers strike mechanism."""
    remaining = state.get("budget_remaining", 100_000)
    if remaining <= 0:
        logger.warning("Budget exhausted — entering strike state")
        return "strike"
    return "continue"


def build_agent_graph(project_id: str | None = None) -> StateGraph:
    """Construct the hierarchical agent graph.

    Returns a compiled LangGraph StateGraph ready for execution.
    """
    graph = StateGraph(AgentState)

    # Add all agent nodes
    graph.add_node("cto", cto_node)
    graph.add_node("engineering_manager", engineering_manager_node)
    graph.add_node("product_manager", product_manager_node)
    graph.add_node("marketing_manager", marketing_manager_node)
    graph.add_node("frontend_dev", frontend_dev_node)
    graph.add_node("backend_architect", backend_architect_node)
    graph.add_node("devops", devops_node)
    graph.add_node("qa_tester", qa_tester_node)
    graph.add_node("product_ops", product_ops_node)
    graph.add_node("growth_analyst", growth_analyst_node)

    # Entry point
    graph.set_entry_point("cto")

    # CTO -> Department Managers (conditional fan-out)
    graph.add_conditional_edges(
        "cto",
        _route_after_cto,
        {
            "engineering_manager": "engineering_manager",
            "product_manager": "product_manager",
            "marketing_manager": "marketing_manager",
        },
    )

    # Engineering Manager -> Specialists
    graph.add_conditional_edges(
        "engineering_manager",
        _route_after_eng_manager,
        {
            "frontend_dev": "frontend_dev",
            "backend_architect": "backend_architect",
            "devops": "devops",
            "qa_tester": "qa_tester",
        },
    )

    # Product Manager -> Product Ops
    graph.add_edge("product_manager", "product_ops")

    # Marketing Manager -> Growth Analyst
    graph.add_edge("marketing_manager", "growth_analyst")

    # All specialists terminate at END
    graph.add_edge("frontend_dev", END)
    graph.add_edge("backend_architect", END)
    graph.add_edge("devops", END)
    graph.add_edge("qa_tester", END)
    graph.add_edge("product_ops", END)
    graph.add_edge("growth_analyst", END)

    compiled = graph.compile()
    logger.info("Agent graph compiled for project %s", project_id)
    return compiled
