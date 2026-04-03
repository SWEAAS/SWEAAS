# Agent Readiness: End-to-End Checklist

> Everything that must be verified, fixed, or built before the agent orchestration
> system can run end-to-end in a real (non-stub) environment.

---

## Table of Contents

1. [Critical Bugs (must fix first)](#1-critical-bugs)
2. [High-Severity Gaps](#2-high-severity-gaps)
3. [Tool Binding (tools are declared but never wired)](#3-tool-binding)
4. [NemoClaw Skills Integration](#4-nemoclaw-skills-integration)
5. [Agency-Agents Role Integration](#5-agency-agents-role-integration)
6. [Graph Topology Issues](#6-graph-topology-issues)
7. [Service-Layer Fixes](#7-service-layer-fixes)
8. [Configuration & Environment Gaps](#8-configuration--environment-gaps)
9. [Database & Persistence Gaps](#9-database--persistence-gaps)
10. [Dependency Audit](#10-dependency-audit)
11. [End-to-End Smoke Test Sequence](#11-end-to-end-smoke-test-sequence)
12. [Summary Matrix](#12-summary-matrix)

---

## 1. Critical Bugs

These will cause runtime failures or corrupt data. Fix before any testing.

### 1.1 Scheduler budget field name mismatch

**File:** `backend/app/services/scheduler_service.py`

`_get_active_projects()` reads `config.monthly_budget`, but `ProjectConfig` defines
the column as `monthly_budget_usd`. The expression `monthly_budget <= 0: continue`
evaluates to `0 <= 0` → `True` for every project, so **no project is ever scheduled**.

**Fix:**
```python
# Change
budget = config.monthly_budget
# To
budget = config.monthly_budget_usd
```

### 1.2 Scheduler never persists `last_execution_at`

`_should_execute_now()` checks `project.get("last_execution_at")`, but
`_get_active_projects()` always sets it to `None`. Combined with a fixed budget
field, every qualifying project would fire **every 15-minute poll cycle** with
no backoff.

**Fix:** After each execution in `_trigger_execution()`, persist
`last_execution_at = datetime.now(UTC)` to the `ProjectConfig` row, and read it
back in `_get_active_projects()`.

### 1.3 `_persist_session` creates orphan records for non-UUID project IDs

**File:** `backend/app/services/orchestration_service.py`

If `project_id` is not a valid UUID, the code replaces it with `uuid.uuid4()`,
attaching the report to a **random, nonexistent** project.

**Fix:** Validate `project_id` at the router level (reject non-UUID input) or
look up the project by slug and resolve to its UUID before graph invocation.

---

## 2. High-Severity Gaps

### 2.1 Tools are declared but never bound to agents

**Files:** `backend/app/agents/tools/__init__.py`, all specialist nodes

`TOOL_REGISTRY` maps roles to LangChain `@tool`-decorated functions, but **no
node or graph step ever calls `get_tools_for_role()`** or binds tools via
`llm.bind_tools()`, `create_react_agent()`, or similar. Specialists only call
`llm_completion()` with raw text — they cannot execute code, create branches,
read files, or call Sentry.

**What needs to happen:**
- Option A: Refactor each specialist node to use `create_react_agent()` from
  LangGraph with the tool list from the registry.
- Option B: Add a `tool_executor` step after each specialist that interprets
  structured tool-call output from the LLM and executes the matching tool.
- Option C (minimal): Have the orchestration service call tools imperatively
  based on structured specialist output (e.g., specialist says "create PR for
  repo X" → orchestration calls `create_pull_request`).

### 2.2 Sandbox/repo context never enters AgentState

`AgentState` has no `sandbox_id` or `repo_name` field. `code_tools.py` needs a
`sandbox_id` to connect to E2B, and `github_tools.py` needs a `repo_name`.
`orchestration_service.py` never provisions an E2B sandbox or resolves the
project's GitHub repo before invoking the graph.

**What needs to happen:**
1. Add `sandbox_id: str` and `repo_name: str` to `AgentState`.
2. In `orchestration_service.submit_task()`, call
   `sandbox_service.get_or_create_sandbox(project_id)` and look up the project's
   repo name from the DB.
3. Inject both into the initial state dict passed to `graph.ainvoke()`.
4. After the run completes, call `sandbox_service.destroy_project_sandbox()`.

### 2.3 Sentry + Greptile called with `project_id` (UUID) instead of slug/repo

| Service | Method | Expects | Gets |
|---------|--------|---------|------|
| `SentryService` | `list_issues(project_slug=...)` | Sentry project slug (e.g. `"sweaas-frontend"`) | UUID |
| `GreptileService` | `query(repo_name=...)` | GitHub repo name (e.g. `"my-app"`) | UUID |
| `cto_review.py` | `_greptile_pr_assessment(project_id, ...)` | GitHub repo name | UUID |

**Fix:** Store `sentry_project_slug` and `github_repo_name` on the `Project` or
`ProjectConfig` model. Resolve them before calling external APIs.

### 2.4 GitHub `commit_and_push` does not apply file changes

**File:** `backend/app/agents/tools/github_tools.py`

The tool rebuilds a commit pointing to the **same tree SHA** as the parent. It
effectively creates an empty commit. The docstring says "Commit changed files"
but no file content is ever written to the tree.

**Fix:** Accept file content (path + content pairs) as input, create blobs and a
new tree via the GitHub Trees API, then create the commit pointing to the new tree.

### 2.5 `sandbox_service` is never called during orchestration

`orchestration_service.py` does not import or use `SandboxService`. Sandboxes are
never created, repos are never cloned into them, and they are never torn down.

**Fix:** Wire the sandbox lifecycle into `submit_task()`:
```
1. sandbox = await sandbox_service.get_or_create_sandbox(project_id)
2. await sandbox_service.clone_project_repo(sandbox.id, repo_name)
3. state["sandbox_id"] = sandbox.id
4. ... run graph ...
5. await sandbox_service.destroy_project_sandbox(project_id)
```

### 2.6 Graph fan-out may not work with `list[str]` return

**File:** `backend/app/agents/graph.py`

`_route_after_budget()` returns `list[str]` for parallel fan-out to managers, but
`add_conditional_edges()` with a string-keyed `path_map` typically expects a
single string. Depending on the LangGraph version, this either:
- Silently picks only the first element
- Raises at compile time
- Works only if `Send()` objects are used

**Fix:** Verify against the installed LangGraph version. If parallel fan-out is
needed, use `Send()`:
```python
from langgraph.graph import Send

def _route_after_budget(state):
    ...
    return [Send(target, state) for target in targets]
```

---

## 3. Tool Binding

### 3.1 Current state

The `TOOL_REGISTRY` in `tools/__init__.py` maps 6 specialist roles to their
permitted tool sets:

| Role | Tools declared |
|------|---------------|
| `frontend_dev` | `execute_shell_command`, `write_code_file`, `read_code_file`, `create_branch`, `commit_and_push`, `create_pull_request`, `get_file_contents`, `search_codebase` |
| `backend_architect` | Same as frontend_dev + `search_agent_memory` |
| `devops` | Same + `get_unresolved_issues`, `get_issue_events` |
| `qa_tester` | Shell, read, search + Sentry tools |
| `product_ops` | `search_agent_memory`, `search_codebase`, `send_agent_email` |
| `growth_analyst` | `search_agent_memory`, `search_codebase` |

### 3.2 What each tool file needs

| Tool file | Status | Blockers |
|-----------|--------|----------|
| `github_tools.py` | Real API calls implemented | `commit_and_push` tree bug (§2.4); needs `repo_name` in state |
| `code_tools.py` | E2B sandbox calls implemented | Needs `sandbox_id` in state (§2.2); E2B API key in env |
| `sentry_tools.py` | Real API calls implemented | Needs correct `project_slug`, not UUID (§2.3) |
| `search_tools.py` | ChromaDB calls implemented | Needs Chroma running; collections must be pre-created |
| `communication_tools.py` | `send_agent_email` uses `agentmail`; `schedule_meeting` is a stub | `agentmail` package API must match import; meeting is fake |

### 3.3 Steps to wire tools end-to-end

1. Add `sandbox_id` and `repo_name` to `AgentState` (§2.2).
2. Choose a tool execution strategy (§2.1 — `create_react_agent` recommended).
3. Refactor each specialist node to be a ReAct agent with its tool list.
4. Add tool-use budget tracking (each tool call should decrement `budget_remaining`).
5. Add error handling for tool failures (retry, fallback, or report to aggregator).

---

## 4. NemoClaw Skills Integration

### 4.1 What NemoClaw provides

NemoClaw (vendored at `vendor/nemoclaw/`) is NVIDIA's reference stack for running
OpenClaw assistants inside OpenShell sandboxes. It provides:

| Asset | Path | What it gives agents |
|-------|------|---------------------|
| **8 Agent Skills** | `.agents/skills/*/SKILL.md` | Structured instructions for sandbox operations |
| **Blueprint** | `nemoclaw-blueprint/blueprint.yaml` | Sandbox image, inference profiles, port config |
| **Network Policies** | `nemoclaw-blueprint/policies/` | Egress rules, integration presets (Slack, Discord, Jira, etc.) |
| **Plugin source** | `nemoclaw/src/` | TypeScript OpenClaw plugin (slash commands, inference routing) |
| **Docs** | `docs/` | 20+ reference documents (architecture, commands, troubleshooting) |
| **Scripts** | `scripts/` | Setup, backup, bridge, inference test scripts |

### 4.2 The 8 NemoClaw skills

| Skill | Purpose |
|-------|---------|
| `nemoclaw-overview` | High-level understanding of NemoClaw |
| `nemoclaw-get-started` | Installation and first connection |
| `nemoclaw-configure-inference` | Switch between NVIDIA/OpenAI/Anthropic/Gemini inference |
| `nemoclaw-manage-policy` | Network policy approval, presets, customization |
| `nemoclaw-monitor-sandbox` | Status checks, logs, inference testing |
| `nemoclaw-deploy-remote` | Remote GPU deployment (Brev), Telegram bridge |
| `nemoclaw-workspace` | OpenClaw workspace file management |
| `nemoclaw-reference` | Deep reference (architecture, commands, inference profiles, network policies, troubleshooting) |
| `update-docs` | Scan git history and update Sphinx docs |

### 4.3 What must be done to make NemoClaw skills accessible

Currently **zero** NemoClaw integration exists in the agent system. To make skills
accessible and injectable:

#### Step 1: Create a NemoClaw skill loader

```
backend/app/agents/prompts/nemoclaw_loader.py
```

Similar pattern to `role_loader.py`:
- Scan `vendor/nemoclaw/.agents/skills/*/SKILL.md`
- Build a slug → path map (e.g. `"configure-inference"` → full path)
- Load skill content + any `references/*.md` files
- Expose `load_nemoclaw_skill(skill_name)` and `list_nemoclaw_skills()`

#### Step 2: Inject skills into relevant agent prompts

| Agent | Skills to inject |
|-------|-----------------|
| `devops` | `nemoclaw-manage-policy`, `nemoclaw-monitor-sandbox`, `nemoclaw-deploy-remote`, `nemoclaw-configure-inference` |
| `backend_architect` | `nemoclaw-reference`, `nemoclaw-workspace` |
| `qa_tester` | `nemoclaw-monitor-sandbox` |
| `engineering_manager` | `nemoclaw-overview`, `nemoclaw-get-started` |
| `cto` / `cto_review` | `nemoclaw-overview` (for architectural awareness) |

#### Step 3: Create NemoClaw tools

| Tool | Purpose | Implementation |
|------|---------|---------------|
| `nemoclaw_status` | Check sandbox status | Shell out to `nemoclaw <name> status` or HTTP to sandbox port 18789 |
| `nemoclaw_policy_set` | Apply a policy preset | Shell `openshell policy set <preset>` or edit `openclaw-sandbox.yaml` |
| `nemoclaw_inference_set` | Switch inference provider | Shell `openshell inference set <provider>` |
| `nemoclaw_logs` | Retrieve sandbox logs | Shell `nemoclaw <name> logs` |

#### Step 4: Add NemoClaw policy presets to tool context

The policy presets at `nemoclaw-blueprint/policies/presets/` include:
`discord.yaml`, `docker.yaml`, `huggingface.yaml`, `jira.yaml`, `npm.yaml`,
`outlook.yaml`, `pypi.yaml`, `slack.yaml`, `telegram.yaml`

These should be loadable by the `nemoclaw_policy_set` tool so agents can apply
integration-specific network policies.

---

## 5. Agency-Agents Role Integration

### 5.1 Current state (after role_loader fix)

The `role_loader.py` now supports:
- **9 explicit mappings** for the 6 graph specialist nodes + 3 managers
- **Auto-discovery** of all 136 roles across 11 categories via slug matching
- `list_available_roles()` and `get_role_categories()` utility functions

### 5.2 The 136 available roles (by category)

| Category | Count | Example roles |
|----------|-------|---------------|
| `engineering` | 26 | `backend-architect`, `frontend-developer`, `devops-automator`, `security-engineer`, `code-reviewer`, `data-engineer`, `database-optimizer`, `sre`, `mobile-app-builder`, `technical-writer`, `ai-engineer`, `software-architect`, `incident-response-commander`, etc. |
| `marketing` | 29 | `growth-hacker`, `seo-specialist`, `content-creator`, `social-media-strategist`, `tiktok-strategist`, `linkedin-content-creator`, `podcast-strategist`, etc. |
| `specialized` | 28 | `compliance-auditor`, `recruitment-specialist`, `salesforce-architect`, `developer-advocate`, `mcp-builder`, `workflow-architect`, `blockchain-security-auditor`, etc. |
| `testing` | 8 | `api-tester`, `accessibility-auditor`, `performance-benchmarker`, `reality-checker`, `tool-evaluator`, `workflow-optimizer`, etc. |
| `design` | 8 | `ui-designer`, `ux-architect`, `ux-researcher`, `brand-guardian`, `visual-storyteller`, `image-prompt-engineer`, etc. |
| `sales` | 8 | `account-strategist`, `deal-strategist`, `outbound-strategist`, `pipeline-analyst`, `sales-engineer`, `proposal-strategist`, etc. |
| `paid-media` | 7 | `ppc-strategist`, `programmatic-buyer`, `paid-social-strategist`, `tracking-specialist`, etc. |
| `support` | 6 | `analytics-reporter`, `infrastructure-maintainer`, `legal-compliance-checker`, `support-responder`, etc. |
| `project-management` | 6 | `project-shepherd`, `jira-workflow-steward`, `experiment-tracker`, `studio-producer`, etc. |
| `product` | 5 | `product-manager`, `feedback-synthesizer`, `sprint-prioritizer`, `trend-researcher`, `behavioral-nudge-engine` |
| `academic` | 5 | `anthropologist`, `geographer`, `historian`, `narratologist`, `psychologist` |

### 5.3 What must be done to make all 136 roles usable

The graph currently has only 6 hardcoded specialist nodes. To make all roles
integratable:

#### Option A: Dynamic specialist node (recommended)

Create a single **generic specialist node factory** that can be instantiated for
any role:

```python
# backend/app/agents/nodes/specialists/dynamic.py

async def make_specialist_node(role_slug: str):
    """Create a specialist node function for any agency-agents role."""
    async def specialist_node(state: AgentState) -> dict:
        role_prompt = load_role_prompt(role_slug)
        task = _get_specialist_task(state, role_slug)
        # ... LLM call with role_prompt + task ...
        return { "results": [...], "messages": [...] }
    return specialist_node
```

Then in `graph.py`, dynamically add nodes based on CTO/manager assignments:

```python
# After CTO decomposition, inspect assignments and add nodes for any role
for assignment in state.get("assignments", []):
    role = assignment["specialist"]
    if role not in graph.nodes:
        graph.add_node(role, await make_specialist_node(role))
```

#### Option B: Pre-register all roles (simpler but heavier)

Register all 136 roles as nodes at graph build time, but only route to the ones
that CTO/managers assign. Unused nodes never execute.

#### Option C: Expand the fixed set incrementally

Add the most-needed roles as dedicated node files (like the existing 6) and
expand over time. Least flexible but most predictable.

### 5.4 Manager routing updates needed

Regardless of approach, the managers must be updated to:

1. **Know what roles are available** — inject `list_available_roles()` into the
   manager system prompt so the LLM can assign to real roles.
2. **Route to dynamic roles** — `_route_after_eng_manager()` currently hardcodes
   the 4 engineering specialists. It must read assignments dynamically.
3. **Add new department managers** if roles from new categories are used (e.g.,
   `design_manager`, `sales_manager`, `support_manager`).

---

## 6. Graph Topology Issues

### 6.1 `_route_after_budget` fan-out

Returns `list[str]` — verify this works with installed LangGraph version or
switch to `Send()` objects (see §2.6).

### 6.2 Product/Marketing managers have only 1 specialist each

`product_manager` always routes to `product_ops` (hard edge, no conditional).
`marketing_manager` always routes to `growth_analyst`. If product or marketing
gain more specialists, these need conditional routing like engineering.

### 6.3 `build_agent_graph` return type annotation

Annotated as `-> StateGraph` but returns `graph.compile()` (a `CompiledGraph`).
Fix the type hint.

### 6.4 `_passthrough_node` defined after `build_agent_graph`

`budget_gate` references `_passthrough_node` which is defined below
`build_agent_graph`. Python handles this at import time (function not called until
runtime), but for readability move it above.

### 6.5 No error recovery in graph

If a specialist node raises an exception, the entire graph invocation fails. There
is no try/catch or error-routing edge. Consider:
- Wrapping each specialist in a try/except that writes an error result
- Adding an "error" edge that routes to the aggregator with partial results

---

## 7. Service-Layer Fixes

### 7.1 `orchestration_service.py`

| Issue | Fix |
|-------|-----|
| Sentry called with UUID instead of slug | Resolve slug from Project model |
| `_persist_session` orphan records | Validate project_id at router level |
| `_SESSIONS` is in-memory only | Persist to DB or Redis for multi-instance |
| Does not create/destroy E2B sandboxes | Wire `SandboxService` lifecycle (§2.5) |
| Does not resolve `repo_name` | Look up from Project model |

### 7.2 `scheduler_service.py`

| Issue | Fix |
|-------|-----|
| `monthly_budget` vs `monthly_budget_usd` | Use correct field name |
| `last_execution_at` always None | Persist and read from DB |
| No circuit breaker for repeated failures | Add failure counter per project |

### 7.3 `report_service.py`

| Issue | Fix |
|-------|-----|
| `get_report_download_url` does not scope by project | Add `project_id` filter to DB query |
| Metadata schema differs from orchestration | Standardize report metadata shape |

### 7.4 `s3_service.py`

| Issue | Fix |
|-------|-----|
| Hardcoded `_BUCKET_NAME = "sweaas-documents"` | Read from `settings.s3_bucket_name` |
| No IAM/credentials validation on init | Add `boto3.client` health check |

### 7.5 `greptile_service.py`

| Issue | Fix |
|-------|-----|
| `_github_token` is always `""` | Read from settings for private repos |
| `review_pull_request` ignores `settings.greptile_merge_threshold` | Use `settings.greptile_merge_threshold` as default |

### 7.6 `github_service.py`

| Issue | Fix |
|-------|-----|
| Uses first installation only (`installations[0]`) | Filter by org or allow config |

### 7.7 `feedback_service.py`

| Issue | Fix |
|-------|-----|
| `_FEEDBACK_STORE` is in-memory | Persist to DB for durability |

### 7.8 `sandbox_service.py`

| Issue | Fix |
|-------|-----|
| `_ACTIVE_SANDBOXES` is in-memory | Persist to DB or use E2B's sandbox listing |
| Not called from orchestration | Wire into orchestration lifecycle (§2.5) |

---

## 8. Configuration & Environment Gaps

### 8.1 Env vars in `.env` but not in `Settings`

These are defined in `.env` but the backend `Settings` class will not read them:

| Variable | Needed by |
|----------|-----------|
| `SUPABASE_ACCESS_TOKEN` | Supabase management API (if used) |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio messaging (if used) |
| `VAPI_PRIVATE_KEY` / `VAPI_PUBLIC_KEY` | Vapi voice integration |
| `DEEPGRAM_API_KEY` | Deepgram transcription |
| `AWS_ACCOUNT_ID` | AWS resource ARNs |

**Action:** Add to `Settings` if these integrations are active, or remove from
`.env` if not needed.

### 8.2 Settings fields not in `.env` sample

| Field | Default | Action |
|-------|---------|--------|
| `s3_bucket_name` | `"sweaas-documents"` | Add `S3_BUCKET_NAME` to `.env` |
| `greptile_merge_threshold` | `0.8` | Add `GREPTILE_MERGE_THRESHOLD` to `.env` |
| `replica_assets_cdn_base_url` | `""` | Add if replica feature is active |

### 8.3 Required credentials for end-to-end

| Service | Env vars needed | Can stub in dev? |
|---------|----------------|------------------|
| LLM (OpenAI or Anthropic) | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | No — core agent logic |
| PostgreSQL | `DATABASE_URL` | No — persistence |
| GitHub App | `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_PATH`, `GITHUB_ORG_NAME` | Yes — tools return `[dev-mode]` |
| E2B | `E2B_API_KEY` | Yes — sandbox skipped |
| Sentry | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Yes — returns empty list |
| Greptile | `GREPTILE_API_KEY` | Yes — PR review skipped |
| AWS S3 | `AWS_REGION`, AWS credentials (IAM/env) | Yes — reports skipped |
| ChromaDB | `CHROMA_HOST`, `CHROMA_PORT` | Yes — search returns empty |
| LangSmith | `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY` | Yes — tracing disabled |
| Stripe | `STRIPE_SECRET_KEY` | Yes — billing skipped |
| AgentMail | `AGENTMAIL_API_KEY` | Yes — email tool returns placeholder |

---

## 9. Database & Persistence Gaps

### 9.1 Models defined but never queried by services

| Model | Table | Used? |
|-------|-------|-------|
| `AgentConfig` | `agent_configs` | Seeded in `seed_data.py`, not queried by orchestration |
| `AgentSession` | `agent_sessions` | Not used (orchestration uses in-memory `_SESSIONS`) |
| `AgentMemory` | `agent_memory` | Not used (ChromaDB used instead) |
| `BudgetAllocation` | `budget_allocations` | Not used (in-memory `BudgetTracker` instead) |
| `Task` | `tasks` | Model exists, no service queries it |

### 9.2 Missing tables or columns

| Need | Current state |
|------|---------------|
| `Project.github_repo_name` | Not a column — needed for GitHub/Greptile APIs |
| `Project.sentry_project_slug` | Not a column — needed for Sentry API |
| `ProjectConfig.last_execution_at` | Not a column — needed for scheduler |
| Session persistence | `_SESSIONS` dict is in-memory; should use `AgentSession` model |
| Feedback persistence | `_FEEDBACK_STORE` dict is in-memory; needs a `feedback_items` table |

### 9.3 Alembic migrations

After adding new columns/tables, run:
```bash
alembic revision --autogenerate -m "add github_repo_name, sentry_slug, last_execution_at"
alembic upgrade head
```

---

## 10. Dependency Audit

### 10.1 Declared in `pyproject.toml` but not imported anywhere

| Package | Status |
|---------|--------|
| `PyGithub` | Not imported (we use `httpx` + JWT for GitHub API) |
| `redis` | `redis_url` in config, but no `import redis` |
| `pgvector` | No vector operations in Python code |
| `e2b-code-interpreter` | Not imported (we use `e2b` directly) |

**Action:** Remove unused packages or add code that uses them.

### 10.2 Imported but not in `pyproject.toml`

| Import | Package needed |
|--------|---------------|
| `typing_extensions` | Transitive via Pydantic (fragile — consider adding explicitly) |

### 10.3 Version compatibility

| Package | Constraint | Risk |
|---------|-----------|------|
| `langgraph` | No version pinned | Breaking API changes to `add_conditional_edges` / `Send` |
| `langchain` | No version pinned | Core dependency — pin to tested version |
| `apscheduler` | `>=3.10.0,<4.0.0` | APScheduler 4.x has completely different API — constraint is correct |

---

## 11. End-to-End Smoke Test Sequence

Run these steps in order to validate the full pipeline:

### Phase 0: Infrastructure

- [ ] PostgreSQL is running and `DATABASE_URL` connects
- [ ] `alembic upgrade head` succeeds with no errors
- [ ] Seed data is loaded (`python -m backend.app.db.seed_data`)
- [ ] ChromaDB is running on `CHROMA_HOST:CHROMA_PORT`
- [ ] At least one LLM API key is set (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)

### Phase 1: Vendor assets

- [ ] `vendor/agency-agents/` exists and contains role `.md` files
- [ ] `vendor/nemoclaw/.agents/skills/` exists and contains SKILL.md files
- [ ] Run the role loader test:
  ```python
  from backend.app.agents.prompts.role_loader import list_available_roles
  roles = list_available_roles()
  assert len(roles) >= 130, f"Only found {len(roles)} roles"
  ```
- [ ] Verify explicit ROLE_MAP entries load real content (not generic):
  ```python
  from backend.app.agents.prompts.role_loader import load_role_prompt
  for role in ["frontend_dev", "backend_architect", "devops", "qa_tester",
               "growth_analyst", "product_ops", "engineering_manager",
               "product_manager", "marketing_manager"]:
      prompt = load_role_prompt(role)
      assert "highly skilled" not in prompt, f"{role} loaded generic prompt"
  ```

### Phase 2: Graph compilation

- [ ] `build_agent_graph()` compiles without error
- [ ] Graph has all expected nodes: `cto`, `budget_gate`, `budget_strike`,
  `engineering_manager`, `product_manager`, `marketing_manager`,
  `frontend_dev`, `backend_architect`, `devops`, `qa_tester`,
  `product_ops`, `growth_analyst`, `aggregator`, `cto_review`
- [ ] Entry point is `cto`
- [ ] Terminal node is `cto_review` → `END`

### Phase 3: Minimal invocation (no tools)

- [ ] Call `graph.ainvoke()` with a simple task and verify:
  - CTO produces subtasks with department labels
  - Budget gate passes (budget_remaining > 0)
  - At least one manager receives work
  - At least one specialist produces output
  - Aggregator produces a `session_summary`
  - CTO review produces a `direction_report`
  - Final state has `status == "completed"`

### Phase 4: Service integration

- [ ] `OrchestrationService.submit_task()` completes and returns `session_id`
- [ ] Session is persisted to DB (not just in-memory)
- [ ] Report PDF is generated (if S3/reportlab configured)
- [ ] Slack webhook fires (if `FEEDBACK_WEBHOOK_URL` configured)

### Phase 5: Tool execution (requires credentials)

- [ ] GitHub tools can create a branch (requires GitHub App credentials)
- [ ] E2B sandbox can be created and destroyed (requires E2B API key)
- [ ] Sentry issues can be fetched (requires Sentry auth token)
- [ ] ChromaDB search returns results (requires indexed data)

### Phase 6: Scheduler

- [ ] `SchedulerService.start()` initializes without error
- [ ] With a project that has `monthly_budget_usd > 0`, verify scheduling fires
- [ ] Verify `last_execution_at` is persisted after execution
- [ ] Verify budget-based interval calculation is correct

---

## 12. Summary Matrix

| Area | Status | Blocking E2E? | Effort |
|------|--------|---------------|--------|
| Role loader paths | **Fixed** | No | Done |
| Role auto-discovery (136 roles) | **Fixed** | No | Done |
| Scheduler budget field | **Broken** | Yes | 10 min |
| Scheduler persistence | **Broken** | Yes | 30 min |
| Orphan session records | **Broken** | Yes | 15 min |
| Tools not bound to agents | **Not wired** | Yes (for real work) | 2-4 hrs |
| Sandbox not in state/lifecycle | **Not wired** | Yes (for code execution) | 1-2 hrs |
| Sentry/Greptile slug mismatch | **Broken** | Yes (for integrations) | 30 min |
| GitHub commit_and_push | **Broken** | Yes (for code commits) | 1 hr |
| Graph fan-out verification | **Unverified** | Possibly | 30 min |
| NemoClaw skill loader | **Not built** | No (optional) | 2 hrs |
| NemoClaw tools | **Not built** | No (optional) | 2-3 hrs |
| Dynamic specialist nodes | **Not built** | No (6 nodes work) | 3-4 hrs |
| S3 bucket from settings | **Bug** | No (hardcoded works) | 5 min |
| Greptile threshold from settings | **Bug** | No (default 0.8 works) | 5 min |
| In-memory stores to DB | **Gap** | No (works single-instance) | 2-3 hrs |
| Missing DB columns | **Gap** | Yes (for integrations) | 1 hr + migration |
| Unused pyproject.toml deps | **Cleanup** | No | 10 min |

**Minimum viable E2E path:** Fix items 1.1-1.3, 2.1 (minimal tool wiring), 2.2,
2.3, and 2.6. Everything else can be done incrementally.
