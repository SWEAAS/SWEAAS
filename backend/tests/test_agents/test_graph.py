"""Tests for the agent orchestration graph (graph.py).

The source module imports ``Send`` from ``langgraph.graph``, but the
installed version may export it from ``langgraph.types`` instead.  We
patch ``langgraph.graph.Send`` so that the import in ``graph.py``
resolves regardless of the installed version.
"""

import asyncio
import sys
from unittest.mock import patch

import pytest

# Ensure Send is available where graph.py expects it.
try:
    from langgraph.graph import Send  # noqa: F401
except ImportError:
    from langgraph.types import Send
    import langgraph.graph as _lg_graph
    _lg_graph.Send = Send

from app.agents.graph import (
    _budget_strike_node,
    _check_budget,
    _route_after_budget,
    _route_after_eng_manager,
    build_agent_graph,
)


# ── build_agent_graph ──────────────────────────────────────────────────────

class TestBuildAgentGraph:
    def test_compiles_without_error(self):
        graph = build_agent_graph(project_id="test-proj")
        assert graph is not None

    def test_compiles_without_project_id(self):
        graph = build_agent_graph()
        assert graph is not None

    def test_graph_has_expected_nodes(self):
        graph = build_agent_graph(project_id="p1")
        node_names = set(graph.get_graph().nodes.keys())
        expected = {
            "cto",
            "budget_gate",
            "budget_strike",
            "engineering_manager",
            "product_manager",
            "marketing_manager",
            "frontend_dev",
            "backend_architect",
            "devops",
            "qa_tester",
            "product_ops",
            "growth_analyst",
            "aggregator",
            "cto_review",
        }
        for name in expected:
            assert name in node_names, f"Missing node: {name}"


# ── _check_budget ──────────────────────────────────────────────────────────

class TestCheckBudget:
    def test_returns_strike_when_budget_zero(self):
        state = {"budget_remaining": 0}
        assert _check_budget(state) == "strike"

    def test_returns_strike_when_budget_negative(self):
        state = {"budget_remaining": -500}
        assert _check_budget(state) == "strike"

    def test_returns_continue_when_budget_positive(self):
        state = {"budget_remaining": 50_000}
        assert _check_budget(state) == "continue"

    def test_returns_continue_when_budget_missing(self):
        assert _check_budget({}) == "continue"


# ── _route_after_budget ────────────────────────────────────────────────────

class TestRouteAfterBudget:
    def test_routes_to_engineering_only(self):
        state = {"subtasks": [{"department": "engineering", "description": "fix bug"}]}
        sends = _route_after_budget(state)
        assert len(sends) == 1
        assert sends[0].node == "engineering_manager"

    def test_routes_to_all_departments(self):
        state = {
            "subtasks": [
                {"department": "engineering", "description": "a"},
                {"department": "product", "description": "b"},
                {"department": "marketing", "description": "c"},
            ]
        }
        sends = _route_after_budget(state)
        target_nodes = {s.node for s in sends}
        assert target_nodes == {"engineering_manager", "product_manager", "marketing_manager"}

    def test_defaults_to_engineering_when_no_subtasks(self):
        sends = _route_after_budget({"subtasks": []})
        assert len(sends) == 1
        assert sends[0].node == "engineering_manager"

    def test_defaults_to_engineering_when_subtasks_missing(self):
        sends = _route_after_budget({})
        assert len(sends) == 1
        assert sends[0].node == "engineering_manager"

    def test_deduplicates_departments(self):
        state = {
            "subtasks": [
                {"department": "engineering", "description": "a"},
                {"department": "engineering", "description": "b"},
            ]
        }
        sends = _route_after_budget(state)
        assert len(sends) == 1


# ── _route_after_eng_manager ──────────────────────────────────────────────

class TestRouteAfterEngManager:
    def test_routes_to_assigned_specialists(self):
        state = {
            "assignments": [
                {"specialist": "frontend_dev", "task": "ui"},
                {"specialist": "devops", "task": "deploy"},
            ]
        }
        sends = _route_after_eng_manager(state)
        target_nodes = {s.node for s in sends}
        assert target_nodes == {"frontend_dev", "devops"}

    def test_defaults_to_backend_architect_when_empty(self):
        sends = _route_after_eng_manager({"assignments": []})
        assert len(sends) == 1
        assert sends[0].node == "backend_architect"

    def test_ignores_unknown_specialists(self):
        state = {"assignments": [{"specialist": "unknown_role", "task": "x"}]}
        sends = _route_after_eng_manager(state)
        assert len(sends) == 1
        assert sends[0].node == "backend_architect"

    def test_all_four_engineering_specialists(self):
        state = {
            "assignments": [
                {"specialist": "frontend_dev", "task": "a"},
                {"specialist": "backend_architect", "task": "b"},
                {"specialist": "devops", "task": "c"},
                {"specialist": "qa_tester", "task": "d"},
            ]
        }
        sends = _route_after_eng_manager(state)
        nodes = {s.node for s in sends}
        assert nodes == {"frontend_dev", "backend_architect", "devops", "qa_tester"}


# ── _budget_strike_node ───────────────────────────────────────────────────

class TestBudgetStrikeNode:
    def test_returns_strike_result(self):
        state = {"project_id": "proj-42", "budget_remaining": 0}
        result = asyncio.run(_budget_strike_node(state))
        assert result["current_agent"] == "budget_strike"
        assert result["status"] == "budget_exhausted"
        assert len(result["results"]) == 1
        assert "exhausted" in result["results"][0]["output"].lower()

    def test_passthrough_preserves_state(self):
        state = {"project_id": "proj-99"}
        result = asyncio.run(_budget_strike_node(state))
        assert "messages" in result
        assert result["messages"][0]["role"] == "system"
