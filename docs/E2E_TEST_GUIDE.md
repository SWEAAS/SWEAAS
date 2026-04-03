# End-to-End Test Guide

Step-by-step instructions to validate the entire SWEAAS platform locally.

## Prerequisites

```bash
# 1. Copy .env.example to .env and fill in required values
cp .env.example .env

# 2. Start infrastructure services
docker compose up -d postgres redis chromadb

# 3. Wait for services to be healthy
docker compose ps

# 4. Activate virtual environment and install dependencies
source .venv/bin/activate
pip install -e .

# 5. Run database migrations
cd backend && alembic upgrade head && cd ..

# 6. Start the backend
cd backend && uvicorn app.main:app --reload --port 8000 &

# 7. (Optional) Start Stripe webhook listener
stripe listen --forward-to localhost:8000/api/v1/stripe/webhook

# 8. (Optional) Start GitHub webhook proxy
# smee --url $GITHUB_WEBHOOK_PROXY_URL --target http://localhost:8000/api/v1/github/webhook
```

---

## 1. Health Check

```bash
# Root endpoint
curl -s http://localhost:8000/ | jq .
# Expected: {"message": "SWEAAS backend is running.", "api_base": "/api/v1", "docs_url": "/docs"}

# Health endpoint
curl -s http://localhost:8000/api/v1/health | jq .
# Expected: {"message": "ok"}
```

---

## 2. Authentication

```bash
# Get current user (dev mode returns placeholder)
curl -s http://localhost:8000/api/v1/auth/me | jq .
# Expected: {"uid": "dev-user", "email": "user@sweaas.dev", "role": "owner", ...}
```

---

## 3. Onboarding Flow

### 3a. Assessment

```bash
curl -s -X POST http://localhost:8000/api/v1/onboarding/assess \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "My Startup",
    "team_size": 10,
    "monthly_budget_usd": 5000.0,
    "contact_email": "founder@startup.com"
  }' | jq .
# Expected: estimated_agent_count, estimated_monthly_cost_usd, recommended_departments
```

### 3b. Contact Capture

```bash
curl -s -X POST http://localhost:8000/api/v1/onboarding/contact \
  -H "Content-Type: application/json" \
  -d '{
    "contact_email": "founder@startup.com",
    "calendar_email": "founder@startup.com",
    "preferred_timeframe": "morning"
  }' | jq .
# Expected: {"status": "received", "next_step": "..."}
```

### 3c. Department List

```bash
curl -s http://localhost:8000/api/v1/onboarding/departments | jq .
# Expected: 4 departments (engineering, marketing, product, support)
```

### 3d. Team Config

```bash
# Save team configuration
curl -s -X PUT http://localhost:8000/api/v1/onboarding/team-config \
  -H "Content-Type: application/json" \
  -d '{
    "company_size": 10,
    "overall_budget_usd": 5000,
    "department_sizes": {"engineering": 5, "marketing": 2, "product": 2, "support": 1},
    "assignments": []
  }' | jq .
# Expected: {"completed": true, "company_size": 10, ...}

# Retrieve saved config
curl -s http://localhost:8000/api/v1/onboarding/team-config | jq .
```

---

## 4. Project Management

### 4a. Create a Project

```bash
curl -s -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First App",
    "description": "A todo list application",
    "github_username": "yourGithubUsername"
  }' | jq .
# Expected: id, name, slug, github_repo_url, sentry_project_slug, status="active"
# Saves the project ID for later:
# PROJECT_ID=$(curl -s ... | jq -r .id)
```

### 4b. List Projects

```bash
curl -s http://localhost:8000/api/v1/projects | jq .
# Expected: array of projects
```

### 4c. Update Project Config

```bash
curl -s -X PATCH "http://localhost:8000/api/v1/projects/${PROJECT_ID}/config" \
  -H "Content-Type: application/json" \
  -d '{
    "monthly_budget_usd": 3000,
    "timeline_weeks": 8,
    "departments": ["engineering", "product"],
    "max_agents": 10
  }' | jq .
```

---

## 5. Agent Directory

```bash
# List all agents
curl -s http://localhost:8000/api/v1/agents | jq '.[].agent_id'

# Get specific agent
curl -s http://localhost:8000/api/v1/agents/cto-01 | jq .

# Agent activity
curl -s http://localhost:8000/api/v1/agents/cto-01/activity | jq .

# Chat with an agent
curl -s -X POST http://localhost:8000/api/v1/agents/cto-01/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What should we prioritize this sprint?"}' | jq .
```

---

## 6. Budget and Billing

```bash
# Budget summary
curl -s http://localhost:8000/api/v1/budget/summary | jq .

# Cost estimate
curl -s -X POST http://localhost:8000/api/v1/budget/estimate \
  -H "Content-Type: application/json" \
  -d '{"seat_count": 5, "monthly_budget_usd": 5000, "usage_profile": "balanced"}' | jq .

# Per-agent consumption
curl -s http://localhost:8000/api/v1/budget/agents/cto-01 | jq .

# Create Stripe checkout (requires STRIPE_SECRET_KEY)
curl -s -X POST "http://localhost:8000/api/v1/budget/checkout?project_id=proj-001&price_id=price_test" | jq .
```

---

## 7. Agent Orchestration

```bash
# Trigger execution (requires a valid project UUID from step 4a)
curl -s -X POST http://localhost:8000/api/v1/orchestration/execute \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"${PROJECT_ID}\",
    \"task\": \"Implement user authentication with JWT\"
  }" | jq .
# Expected: session_id, status, session_summary

# Check status
curl -s "http://localhost:8000/api/v1/orchestration/status/${PROJECT_ID}" | jq .

# List sessions
curl -s "http://localhost:8000/api/v1/orchestration/sessions/${PROJECT_ID}" | jq .

# List reports
curl -s "http://localhost:8000/api/v1/orchestration/reports/${PROJECT_ID}" | jq .
```

---

## 8. Feedback Loop

```bash
# Submit feedback via API
curl -s -X POST http://localhost:8000/api/v1/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Login page is slow",
    "body": "Takes 5 seconds to load the login form",
    "category": "bug",
    "source": "in_app",
    "priority": "high"
  }' | jq .

# Simulate Intercom webhook
curl -s -X POST http://localhost:8000/api/v1/feedback/webhooks/intercom \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Customer complaint",
    "body": "Dashboard not loading",
    "project_id": "proj-001"
  }' | jq .

# Simulate Canny webhook
curl -s -X POST http://localhost:8000/api/v1/feedback/webhooks/canny \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Dark mode request",
    "body": "Multiple users want dark mode support"
  }' | jq .

# List all feedback
curl -s http://localhost:8000/api/v1/feedback | jq .
```

---

## 9. GitHub Webhook

```bash
# Simulate a ping event
curl -s -X POST http://localhost:8000/api/v1/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{"zen": "Speak like a human."}' | jq .
# Expected: {"status": "pong", "zen": "Speak like a human."}

# Simulate a push event
curl -s -X POST http://localhost:8000/api/v1/github/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{
    "ref": "refs/heads/main",
    "pusher": {"name": "developer"},
    "commits": [{"id": "abc123", "message": "Add auth module"}],
    "repository": {"full_name": "SWEAAS/my-first-app"}
  }' | jq .
```

---

## 10. Observability

```bash
# Dashboard overview
curl -s http://localhost:8000/api/v1/observability/overview | jq .

# Reports
curl -s http://localhost:8000/api/v1/observability/reports | jq .

# Sentry issues (requires SENTRY_AUTH_TOKEN)
curl -s http://localhost:8000/api/v1/observability/sentry/issues | jq .
```

---

## 11. Communication

```bash
# CTO context (agent activity snapshot)
curl -s http://localhost:8000/api/v1/communication/cto-context | jq .

# Send email (requires AGENTMAIL_API_KEY)
curl -s -X POST http://localhost:8000/api/v1/communication/email \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "user@example.com",
    "subject": "Sprint Update",
    "body": "Here is the weekly sprint summary..."
  }' | jq .
```

---

## 12. Stripe Connect

```bash
# Start Connect onboarding
curl -s -X POST http://localhost:8000/api/v1/stripe/connect/onboard | jq .

# Check Connect status
curl -s http://localhost:8000/api/v1/stripe/connect/status | jq .

# Revenue summary
curl -s http://localhost:8000/api/v1/stripe/revenue | jq .

# Simulate Stripe webhook (no secret configured)
curl -s -X POST http://localhost:8000/api/v1/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "checkout.session.completed", "data": {"object": {}}}' | jq .
```

---

## Verification Checkpoints

### Database Verification (connect to Postgres)

```bash
docker compose exec postgres psql -U sweaas -d sweaas
```

```sql
-- Check dev user and org exist
SELECT u.id, u.email, u.role, o.name AS org_name
FROM users u JOIN organizations o ON u.organization_id = o.id
WHERE u.supabase_uid = 'dev-user';

-- Check projects
SELECT id, name, slug, status, github_repo_name, sentry_project_slug
FROM projects;

-- Check project configs
SELECT pc.project_id, pc.monthly_budget_usd, pc.timeline_weeks, pc.departments
FROM project_configs pc;

-- Check reports
SELECT id, project_id, title, report_type, created_at
FROM reports ORDER BY created_at DESC LIMIT 10;

-- Check token usage
SELECT agent_slug, model, total_tokens, cost_usd, created_at
FROM token_usage_logs ORDER BY created_at DESC LIMIT 10;

-- Check notifications
SELECT id, type, priority, title, status, created_at
FROM notifications ORDER BY created_at DESC LIMIT 10;
```

### Redis Verification

```bash
docker compose exec redis redis-cli
> KEYS *
> INFO keyspace
```

### S3 Verification (if AWS configured)

```bash
aws s3 ls s3://sweaas-documents/ --recursive
```

---

## Automated Integration Tests

Run the integration test suite against a running stack:

```bash
SWEAAS_INTEGRATION=1 pytest backend/tests/integration/ -v --tb=short
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ConnectionRefused` on port 5432 | Postgres not running | `docker compose up -d postgres` |
| `401 Unauthorized` on protected routes | AUTH_ENFORCE_JWT=true without Supabase | Set `AUTH_ENFORCE_JWT=false` in `.env` |
| Agent chat returns fallback | No LLM API key configured | Set `OPENAI_API_KEY` or `XAI_API_KEY` in `.env` |
| Sentry issues returns empty | No Sentry auth token | Set `SENTRY_AUTH_TOKEN` in `.env` |
| Stripe checkout returns dev URL | No Stripe secret key | Set `STRIPE_SECRET_KEY` in `.env` |
| GitHub repo creation returns dev stub | No GitHub App key | Set `GITHUB_APP_ID` and key path in `.env` |
