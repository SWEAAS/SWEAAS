# Frontend Integration Guide

Complete reference for integrating the SWEAAS frontend with the backend API.
All endpoints are under `{API_BASE}/api/v1`.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Project Lifecycle](#project-lifecycle)
3. [Agent Orchestration](#agent-orchestration)
4. [Agent Directory and Chat](#agent-directory-and-chat)
5. [Budget and Billing](#budget-and-billing)
6. [Reports](#reports)
7. [Feedback System](#feedback-system)
8. [Communication](#communication)
9. [Observability Dashboard](#observability-dashboard)
10. [Scheduling Configuration](#scheduling-configuration)
11. [Context and Storage Map](#context-and-storage-map)
12. [User Feedback Button Spec](#user-feedback-button-spec)

---

## Authentication

All requests require a Supabase JWT in the `Authorization: Bearer <token>` header.
In dev mode (`AUTH_ENFORCE_JWT=false`), requests are accepted without auth.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/me` | GET | Get current user profile |

The frontend should store the JWT from Supabase Auth and attach it to all API requests.
Use `X-Project-Token` header for public customer-facing endpoints (e.g. customer calls).

---

## Project Lifecycle

### Create a Project

```
POST /api/v1/projects
```

**Request body:**
```json
{
  "name": "my-project",
  "description": "Project description",
  "github_username": "optional-github-user"
}
```

**What happens on the backend:**
1. GitHub repo created under the SWEAAS org
2. User added as collaborator (if `github_username` provided)
3. Greptile indexes the repository
4. Sentry project + DSN provisioned
5. Onboarding document uploaded to S3
6. Project config row created in DB

**Response:** Project object with `id`, `github_repo_url`, `sentry_dsn`.

### List Projects

```
GET /api/v1/projects
```

Returns all projects for the authenticated user's organization.

### Get Project

```
GET /api/v1/projects/{project_id}
```

### Update Project Config

```
PATCH /api/v1/projects/{project_id}/config
```

**Request body:**
```json
{
  "monthly_budget": 50.0,
  "timeline_weeks": 4,
  "departments": "engineering,product",
  "max_agents": 5
}
```

This updates the scheduling parameters. The scheduler service uses
`monthly_budget` to calculate how frequently agents wake up.

---

## Agent Orchestration

The orchestration system runs the full hierarchical agent pipeline.

### Execute a Task

```
POST /api/v1/orchestration/execute
```

**Request body:**
```json
{
  "project_id": "uuid-here",
  "task": "Implement user authentication with JWT and refresh tokens",
  "feedback_items": []
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "project_id": "uuid",
  "status": "completed",
  "session_summary": "...",
  "direction_report": "...",
  "error": null
}
```

**What happens:**
1. CTO decomposes the task into department subtasks
2. Budget check — if exhausted, enters "strike" state
3. Department managers assign work to specialists
4. Specialists execute (with E2B sandboxes, GitHub tools, etc.)
5. Aggregator collects all results into session summary
6. CTO reviews results, produces direction report
7. PDF reports generated and uploaded to S3
8. Slack webhook notified

### Check Execution Status

```
GET /api/v1/orchestration/status/{project_id}
```

**Response:**
```json
{
  "project_id": "uuid",
  "active_agents": 3,
  "running_tasks": 1,
  "status": "running",
  "active_sessions": ["session-uuid"]
}
```

Use this endpoint to poll for real-time status. Recommended polling
interval: 5 seconds while `status === "running"`.

### List Past Sessions

```
GET /api/v1/orchestration/sessions/{project_id}
```

**Response:**
```json
{
  "project_id": "uuid",
  "sessions": [
    {
      "session_id": "uuid",
      "status": "completed",
      "task": "Implement auth...",
      "started_at": "2026-04-03T10:00:00Z",
      "completed_at": "2026-04-03T10:05:00Z"
    }
  ]
}
```

### List Reports

```
GET /api/v1/orchestration/reports/{project_id}
```

Returns session reports and CTO direction reports.

### Download Report PDF

```
GET /api/v1/orchestration/reports/{project_id}/{report_id}/pdf
```

Returns a presigned S3 download URL:
```json
{
  "download_url": "https://s3.amazonaws.com/...",
  "report_id": "uuid"
}
```

---

## Agent Directory and Chat

### List All Agents

```
GET /api/v1/agents
```

Returns the full agent roster with hierarchy info, status, budget usage.

### Get Agent Details

```
GET /api/v1/agents/{agent_id}
```

Agent IDs follow this pattern:
- `cto-01` — CTO
- `eng-mgr-01` — Engineering Manager
- `eng-fe-01` — Frontend Developer
- `eng-be-01` — Backend Architect
- `eng-do-01` — DevOps
- `eng-qa-01` — QA Tester
- `prd-mgr-01` — Product Manager
- `prd-ops-01` — Product Ops
- `mkt-mgr-01` — Marketing Manager
- `mkt-ga-01` — Growth Analyst
- `sup-mgr-01` — Customer Success Manager
- `sup-cs-01` — Customer Support

### Agent Activity

```
GET /api/v1/agents/{agent_id}/activity
```

### Chat with an Agent

```
POST /api/v1/agents/{agent_id}/chat
```

**Request body:**
```json
{
  "message": "What are you currently working on?",
  "project_id": "optional-project-uuid"
}
```

This injects context that guides the agent's next task. Use `sup-cs-01`
for customer-facing chat (product users, not platform owners).

---

## Budget and Billing

### Budget Summary

```
GET /api/v1/budget/summary
```

Returns token usage across all agents.

### Budget Estimate

```
POST /api/v1/budget/estimate
```

**Request body:**
```json
{
  "monthly_budget_usd": 100.0,
  "project_complexity": "medium"
}
```

Returns recommended agent count and session frequency.

### Per-Agent Budget

```
GET /api/v1/budget/agents/{agent_id}
```

Returns daily token budget, usage, strike count.

### Stripe Checkout

```
POST /api/v1/budget/checkout?project_id=uuid&price_id=price_xxx
```

Creates a Stripe Checkout session for subscription billing.

### Stripe Webhook

```
POST /api/v1/budget/webhook
```

Handles subscription events from Stripe.

---

## Reports

Reports are generated automatically after each orchestration session:

1. **Session Report** — What was worked on, specialist outputs, issues found
2. **CTO Direction Report** — Assessment, next priorities, merge decisions

Both are stored as dated PDFs in S3 and metadata in PostgreSQL.

Access via:
- `GET /api/v1/orchestration/reports/{project_id}` — list all
- `GET /api/v1/orchestration/reports/{project_id}/{report_id}/pdf` — download

Reports are also visible in:
- `GET /api/v1/observability/overview` — dashboard metrics
- `GET /api/v1/observability/reports` — report list

---

## Feedback System

### Submit Feedback (Authenticated)

```
POST /api/v1/feedback
```

**Request body:**
```json
{
  "project_id": "uuid",
  "title": "Button doesn't work on mobile",
  "body": "Detailed description...",
  "source": "user_feedback",
  "category": "bug",
  "user_email": "user@example.com",
  "priority": "high"
}
```

Sources: `user_feedback`, `sentry`, `intercom`, `canny`, `slack`, `github_issue`, `other`

### List Feedback

```
GET /api/v1/feedback?project_id=uuid
```

### External Webhooks

```
POST /api/v1/feedback/webhooks/intercom
POST /api/v1/feedback/webhooks/canny
```

All feedback is scoped by `project_id` — agents only see feedback for their project.

---

## Communication

### CTO Video Call (Owner)

```
POST /api/v1/communication/cto-call
```

Creates a Tavus CVI session with the CTO agent persona.

### Customer Support Call (End Users)

```
POST /api/v1/communication/customer-call
```

Uses `X-Project-Token` header for authentication (not JWT).
Creates a Tavus session with the customer support persona.

### Send Email

```
POST /api/v1/communication/email
```

Sends email via AgentMail.

### CTO Context

```
GET /api/v1/communication/cto-context
```

Returns context for the CTO video call (recent activity, project state).

---

## Observability Dashboard

### Overview Metrics

```
GET /api/v1/observability/overview
```

Returns department metrics, active agents, running tasks.

### Sentry Issues

```
GET /api/v1/observability/sentry/issues
```

Returns unresolved Sentry issues for the platform.

---

## Scheduling Configuration

The scheduler determines how frequently agents wake up based on budget:

```
monthly_budget / cost_per_session = max_sessions_per_month
30 days / max_sessions = interval_between_sessions
```

Default cost estimate: ~$0.15 per session (depends on LLM model).

Configure via `PATCH /api/v1/projects/{project_id}/config`:
- `monthly_budget` — USD budget per month
- `max_agents` — Maximum concurrent agents

The scheduler runs automatically — no frontend action needed beyond
setting the budget. Status is visible via the orchestration status endpoint.

---

## Context and Storage Map

| Data | Storage | API to Access |
|------|---------|---------------|
| User/org profiles | PostgreSQL `users`, `organizations` | `/auth/me` |
| Projects | PostgreSQL `projects` | `/projects` |
| Project config | PostgreSQL `project_configs` | `/projects/{id}/config` |
| Agent directory | In-memory seed + PostgreSQL `agent_configs` | `/agents` |
| Token usage | PostgreSQL `token_usage_logs` + in-memory | `/budget/summary` |
| Feedback | In-memory (prod: PostgreSQL) | `/feedback` |
| Session results | In-memory + PostgreSQL `reports` | `/orchestration/sessions/{id}` |
| PDF reports | AWS S3 `sweaas-documents` bucket | `/orchestration/reports/{id}/{rid}/pdf` |
| Onboarding docs | AWS S3 `sweaas-documents` bucket | Fetched internally by orchestration |
| Agent memory | ChromaDB vector collections | Internal (agent tools) |
| Codebase index | ChromaDB + Greptile | Internal (agent tools) |
| Execution state | LangGraph in-memory per session | `/orchestration/status/{id}` |
| Scheduling | APScheduler in-memory | Automatic |
| LLM tracing | LangSmith (external) | LangSmith dashboard |

---

## User Feedback Button Spec

**Every client product with a frontend MUST include a feedback button.**

### Requirements

1. Visible on every page (fixed position, bottom-right recommended)
2. Opens a modal/drawer with:
   - Title field (required, max 200 chars)
   - Description field (optional, max 10,000 chars)
   - Category dropdown: `bug`, `feature`, `improvement`, `general`
   - Priority selector: `low`, `medium`, `high`, `critical`
   - Optional email field
3. Submits to `POST /api/v1/feedback` with the project's `project_id`
4. Shows confirmation toast on success
5. Feedback is automatically picked up by agents on the next scheduling cycle

### Example Implementation

```tsx
const submitFeedback = async (data: FeedbackForm) => {
  await fetch(`${API_BASE}/api/v1/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: currentProjectId,
      title: data.title,
      body: data.description,
      source: 'user_feedback',
      category: data.category,
      priority: data.priority,
      user_email: data.email,
    }),
  });
};
```

### Sentry Integration

Client frontends should also integrate Sentry with the project-specific DSN
returned from project creation. Runtime errors are automatically routed to
agents via the Sentry -> feedback pipeline.

```tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: project.sentry_dsn,  // from GET /api/v1/projects/{id}
  environment: 'production',
});
```
