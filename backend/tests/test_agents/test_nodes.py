"""Tests for individual agent node functions (CTO, managers, aggregator, specialists)."""

import asyncio
import json
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# All node modules use lazy imports: `from app.core.llm import ...` inside
# the function body.  We must patch at the *source* module, not the
# consumer module.
_LLM_CREDS = "app.core.llm.llm_has_credentials"
_LLM_COMPLETION = "app.core.llm.llm_completion"
_RUN_AGENT = "app.core.llm.run_agent_with_tools"


@dataclass
class _FakeLLMResult:
    content: str = ""
    prompt_tokens: int = 50
    completion_tokens: int = 50
    total_tokens: int = 100
    cost_usd: float = 0.001
    model: str = "test-model"
    raw: object = None


def _make_state(**overrides) -> dict:
    """Build a minimal AgentState dict with sensible defaults."""
    base = {
        "task": "Implement user auth",
        "project_id": "proj-test",
        "session_id": "sess-001",
        "sandbox_id": "sandbox-dev-test",
        "repo_name": "test-repo",
        "sentry_project_slug": "test-sentry",
        "onboarding_context": "",
        "feedback_items": [],
        "messages": [],
        "subtasks": [],
        "assignments": [],
        "results": [],
        "budget_remaining": 100_000,
    }
    base.update(overrides)
    return base


# ── CTO node ──────────────────────────────────────────────────────────────

class TestCTONode:
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_produces_subtasks(self, _mock_creds):
        from app.agents.nodes.cto import cto_node

        state = _make_state(task="Fix the login bug and deploy")
        result = asyncio.run(cto_node(state))

        assert result["status"] == "delegated"
        assert result["current_agent"] == "cto"
        assert len(result["subtasks"]) >= 1
        departments = {s["department"] for s in result["subtasks"]}
        assert "engineering" in departments

    @patch(_LLM_COMPLETION, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    def test_llm_path_parses_json(self, _mock_creds, mock_llm):
        from app.agents.nodes.cto import cto_node

        mock_llm.return_value = _FakeLLMResult(
            content=json.dumps({
                "analysis": "Test analysis",
                "subtasks": [
                    {"department": "engineering", "description": "code it", "priority": "high"},
                    {"department": "product", "description": "spec it", "priority": "medium"},
                ],
                "status": "delegated",
            })
        )
        result = asyncio.run(cto_node(_make_state()))
        assert result["status"] == "delegated"
        assert len(result["subtasks"]) == 2
        assert result["subtasks"][0]["department"] == "engineering"

    @patch(_LLM_COMPLETION, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    def test_llm_non_json_falls_back(self, _mock_creds, mock_llm):
        from app.agents.nodes.cto import cto_node

        mock_llm.return_value = _FakeLLMResult(content="not valid json at all")
        result = asyncio.run(cto_node(_make_state()))
        assert result["status"] == "delegated"
        assert len(result["subtasks"]) == 1
        assert result["subtasks"][0]["department"] == "engineering"

    def test_rule_based_decompose_keywords(self):
        from app.agents.nodes.cto import _rule_based_decompose

        subtasks = _rule_based_decompose("Fix the login bug and run tests")
        departments = {s["department"] for s in subtasks}
        assert "engineering" in departments

    def test_rule_based_decompose_marketing(self):
        from app.agents.nodes.cto import _rule_based_decompose

        subtasks = _rule_based_decompose("Launch a new marketing campaign")
        departments = {s["department"] for s in subtasks}
        assert "marketing" in departments

    def test_rule_based_decompose_unknown_defaults_engineering(self):
        from app.agents.nodes.cto import _rule_based_decompose

        subtasks = _rule_based_decompose("Do something vague")
        assert len(subtasks) == 1
        assert subtasks[0]["department"] == "engineering"

    @patch(_LLM_COMPLETION, new_callable=AsyncMock, side_effect=RuntimeError("No API key"))
    @patch(_LLM_CREDS, return_value=True)
    def test_graceful_fallback_on_llm_error(self, _creds, _llm):
        from app.agents.nodes.cto import cto_node

        result = asyncio.run(cto_node(_make_state()))
        assert result["status"] == "delegated"
        assert len(result["subtasks"]) >= 1


# ── Engineering Manager node ──────────────────────────────────────────────

class TestEngineeringManagerNode:
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_assigns_backend_for_api_task(self, _creds):
        from app.agents.nodes.engineering_manager import engineering_manager_node

        state = _make_state(
            subtasks=[{"department": "engineering", "description": "Design database schema for orders", "priority": "high"}]
        )
        result = asyncio.run(engineering_manager_node(state))

        assert result["current_agent"] == "engineering_manager"
        assert len(result["assignments"]) == 1
        assert result["assignments"][0]["specialist"] == "backend_architect"

    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_assigns_frontend_for_ui_task(self, _creds):
        from app.agents.nodes.engineering_manager import engineering_manager_node

        state = _make_state(
            subtasks=[{"department": "engineering", "description": "Build React frontend component", "priority": "high"}]
        )
        result = asyncio.run(engineering_manager_node(state))

        assert result["assignments"][0]["specialist"] == "frontend_dev"

    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_assigns_devops_for_deploy_task(self, _creds):
        from app.agents.nodes.engineering_manager import engineering_manager_node

        state = _make_state(
            subtasks=[{"department": "engineering", "description": "Set up CI pipeline and deploy", "priority": "high"}]
        )
        result = asyncio.run(engineering_manager_node(state))

        assert result["assignments"][0]["specialist"] == "devops"

    def test_no_engineering_tasks_returns_empty(self):
        from app.agents.nodes.engineering_manager import engineering_manager_node

        state = _make_state(
            subtasks=[{"department": "product", "description": "Research users", "priority": "medium"}]
        )
        result = asyncio.run(engineering_manager_node(state))
        assert result["current_agent"] == "engineering_manager"
        assert "assignments" not in result

    @patch(_LLM_COMPLETION, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    def test_llm_path_parses_assignments(self, _creds, mock_llm):
        from app.agents.nodes.engineering_manager import engineering_manager_node

        mock_llm.return_value = _FakeLLMResult(
            content=json.dumps({
                "assignments": [
                    {"specialist": "qa_tester", "task": "write tests", "priority": "high"},
                ],
                "status": "assigned",
            })
        )
        state = _make_state(
            subtasks=[{"department": "engineering", "description": "write tests", "priority": "high"}]
        )
        result = asyncio.run(engineering_manager_node(state))
        assert result["status"] == "assigned"
        assert result["assignments"][0]["specialist"] == "qa_tester"


# ── Product Manager node ──────────────────────────────────────────────────

class TestProductManagerNode:
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_assigns_product_ops(self, _creds):
        from app.agents.nodes.product_manager import product_manager_node

        state = _make_state(
            subtasks=[{"department": "product", "description": "User research", "priority": "medium"}]
        )
        result = asyncio.run(product_manager_node(state))

        assert result["current_agent"] == "product_manager"
        assert result["assignments"][0]["specialist"] == "product_ops"

    def test_no_product_tasks_returns_message(self):
        from app.agents.nodes.product_manager import product_manager_node

        state = _make_state(subtasks=[])
        result = asyncio.run(product_manager_node(state))
        assert result["current_agent"] == "product_manager"


# ── Marketing Manager node ────────────────────────────────────────────────

class TestMarketingManagerNode:
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_assigns_growth_analyst(self, _creds):
        from app.agents.nodes.marketing_manager import marketing_manager_node

        state = _make_state(
            subtasks=[{"department": "marketing", "description": "Run campaign", "priority": "medium"}]
        )
        result = asyncio.run(marketing_manager_node(state))

        assert result["current_agent"] == "marketing_manager"
        assert result["assignments"][0]["specialist"] == "growth_analyst"

    def test_no_marketing_tasks_returns_message(self):
        from app.agents.nodes.marketing_manager import marketing_manager_node

        state = _make_state(subtasks=[])
        result = asyncio.run(marketing_manager_node(state))
        assert result["current_agent"] == "marketing_manager"


# ── Aggregator node ───────────────────────────────────────────────────────

class TestAggregatorNode:
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_produces_summary(self, _creds):
        from app.agents.nodes.aggregator import aggregator_node

        state = _make_state(
            results=[
                {"agent": "backend_architect", "output": "Built the API"},
                {"agent": "qa_tester", "output": "All tests pass"},
            ]
        )
        result = asyncio.run(aggregator_node(state))

        assert result["current_agent"] == "aggregator"
        assert result["status"] == "review_pending"
        assert result["session_summary"]
        parsed = json.loads(result["session_summary"])
        assert "summary" in parsed
        assert len(parsed["completed_tasks"]) == 2

    @patch(_LLM_CREDS, return_value=False)
    def test_empty_results_still_produces_summary(self, _creds):
        from app.agents.nodes.aggregator import aggregator_node

        state = _make_state(results=[])
        result = asyncio.run(aggregator_node(state))

        assert result["current_agent"] == "aggregator"
        assert result["session_summary"]

    @patch(_LLM_COMPLETION, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    def test_llm_path_returns_summary(self, _creds, mock_llm):
        from app.agents.nodes.aggregator import aggregator_node

        mock_llm.return_value = _FakeLLMResult(content='{"summary": "All good"}')
        state = _make_state(results=[{"agent": "devops", "output": "deployed"}])
        result = asyncio.run(aggregator_node(state))
        assert result["status"] == "review_pending"
        assert "All good" in result["session_summary"]


# ── CTO Review node ──────────────────────────────────────────────────────

class TestCTOReviewNode:
    @patch(
        "app.agents.nodes.cto_review._greptile_pr_assessment",
        new_callable=AsyncMock,
        return_value="",
    )
    @patch(_LLM_CREDS, return_value=False)
    def test_fallback_produces_direction_report(self, _creds, _mock_greptile):
        from app.agents.nodes.cto_review import cto_review_node

        state = _make_state(session_summary="Session did stuff")
        result = asyncio.run(cto_review_node(state))

        assert result["current_agent"] == "cto_review"
        assert result["status"] == "completed"
        assert result["direction_report"]
        parsed = json.loads(result["direction_report"])
        assert parsed["completed"] is True
        assert "next_priorities" in parsed

    @patch(
        "app.agents.nodes.cto_review._greptile_pr_assessment",
        new_callable=AsyncMock,
        return_value="",
    )
    @patch(_LLM_COMPLETION, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    def test_llm_path_returns_direction_report(self, _creds, mock_llm, _greptile):
        from app.agents.nodes.cto_review import cto_review_node

        mock_llm.return_value = _FakeLLMResult(
            content=json.dumps({"assessment": "Great session", "completed": True})
        )
        state = _make_state(session_summary="Session summary here")
        result = asyncio.run(cto_review_node(state))
        assert result["status"] == "completed"
        assert "Great session" in result["direction_report"]


# ── Specialist nodes (backend_architect, frontend_dev) ────────────────────

class TestSpecialistNodes:
    @patch("app.agents.nodes.specialists.backend_architect.load_role_prompt", return_value="You are a backend architect.")
    @patch(_LLM_CREDS, return_value=False)
    def test_backend_architect_stub_mode(self, _creds, _mock_prompt):
        from app.agents.nodes.specialists.backend_architect import backend_architect_node

        state = _make_state(
            assignments=[{"specialist": "backend_architect", "task": "Build API"}]
        )
        result = asyncio.run(backend_architect_node(state))

        assert result["current_agent"] == "backend_architect"
        assert len(result["results"]) == 1
        assert "stub" in result["results"][0]["output"].lower()

    @patch("app.agents.nodes.specialists.frontend_dev.load_role_prompt", return_value="You are a frontend dev.")
    @patch(_LLM_CREDS, return_value=False)
    def test_frontend_dev_stub_mode(self, _creds, _mock_prompt):
        from app.agents.nodes.specialists.frontend_dev import frontend_dev_node

        state = _make_state(
            assignments=[{"specialist": "frontend_dev", "task": "Build login form"}]
        )
        result = asyncio.run(frontend_dev_node(state))

        assert result["current_agent"] == "frontend_dev"
        assert "stub" in result["results"][0]["output"].lower()

    @patch(_RUN_AGENT, new_callable=AsyncMock)
    @patch(_LLM_CREDS, return_value=True)
    @patch("app.agents.nodes.specialists.backend_architect.load_role_prompt", return_value="prompt")
    def test_backend_architect_llm_path(self, _prompt, _creds, mock_agent):
        from app.agents.nodes.specialists.backend_architect import backend_architect_node

        mock_agent.return_value = _FakeLLMResult(content="Created endpoint /api/users")
        state = _make_state(
            assignments=[{"specialist": "backend_architect", "task": "Build API"}]
        )
        result = asyncio.run(backend_architect_node(state))
        assert result["current_agent"] == "backend_architect"
        assert "Created endpoint" in result["results"][0]["output"]
        assert result["budget_remaining"] < 100_000

    @patch(_RUN_AGENT, new_callable=AsyncMock, side_effect=RuntimeError("API key invalid"))
    @patch(_LLM_CREDS, return_value=True)
    @patch("app.agents.nodes.specialists.backend_architect.load_role_prompt", return_value="prompt")
    def test_backend_architect_error_fallback(self, _prompt, _creds, _agent):
        from app.agents.nodes.specialists.backend_architect import backend_architect_node

        state = _make_state(
            assignments=[{"specialist": "backend_architect", "task": "Build API"}]
        )
        result = asyncio.run(backend_architect_node(state))
        assert result["current_agent"] == "backend_architect"
        assert "error" in result["results"][0]["output"].lower()
