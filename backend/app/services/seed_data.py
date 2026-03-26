"""Seed data for the initial API scaffold."""

AGENTS = [
    {
        "agent_id": "eng-platform-01",
        "name": "Platform Copilot",
        "department": "engineering",
        "status": "active",
        "owner_email": "eng-lead@sweaas.dev",
        "daily_token_budget": 120_000,
        "tokens_used_today": 83_500,
        "description": "Supports engineering teams with platform operations and delivery workflows.",
        "current_focus": "Reviewing deployment drift and backlog burn-down.",
        "strike_count": 0,
        "recent_activity": [
            {
                "agent_id": "eng-platform-01",
                "activity_id": "act-1001",
                "title": "Terraform drift summary",
                "detail": "Compared last applied plan against staging infrastructure.",
                "state": "completed",
                "started_at": "2026-03-25T09:00:00Z",
            },
            {
                "agent_id": "eng-platform-01",
                "activity_id": "act-1002",
                "title": "Release risk review",
                "detail": "Analyzing incidents and blocked deploys before next release.",
                "state": "running",
                "started_at": "2026-03-25T10:30:00Z",
            },
        ],
    },
    {
        "agent_id": "mkt-growth-01",
        "name": "Growth Analyst",
        "department": "marketing",
        "status": "warning",
        "owner_email": "marketing@sweaas.dev",
        "daily_token_budget": 90_000,
        "tokens_used_today": 88_000,
        "description": "Tracks campaign performance and drafts outbound recommendations.",
        "current_focus": "Recommending budget shifts for underperforming campaigns.",
        "strike_count": 1,
        "recent_activity": [
            {
                "agent_id": "mkt-growth-01",
                "activity_id": "act-2001",
                "title": "Campaign anomaly detection",
                "detail": "Flagged rising cost per lead across paid social.",
                "state": "completed",
                "started_at": "2026-03-25T08:10:00Z",
            },
            {
                "agent_id": "mkt-growth-01",
                "activity_id": "act-2002",
                "title": "Quarterly budget rebalance",
                "detail": "Estimating channel mix changes under current spend limits.",
                "state": "running",
                "started_at": "2026-03-25T11:05:00Z",
            },
        ],
    },
    {
        "agent_id": "prd-ops-01",
        "name": "Product Operations",
        "department": "product",
        "status": "active",
        "owner_email": "product@sweaas.dev",
        "daily_token_budget": 75_000,
        "tokens_used_today": 40_500,
        "description": "Summarizes roadmap signals and keeps product rituals coordinated.",
        "current_focus": "Preparing roadmap summaries for department heads.",
        "strike_count": 0,
        "recent_activity": [
            {
                "agent_id": "prd-ops-01",
                "activity_id": "act-3001",
                "title": "Roadmap synthesis",
                "detail": "Compiled feature progress across engineering and marketing asks.",
                "state": "running",
                "started_at": "2026-03-25T10:00:00Z",
            }
        ],
    },
]

REPORTS = [
    {
        "report_id": "rpt-001",
        "title": "Daily operations summary",
        "summary": "Engineering remains healthy, while marketing is close to token limits.",
        "created_at": "2026-03-25T12:00:00Z",
    },
    {
        "report_id": "rpt-002",
        "title": "Onboarding conversion report",
        "summary": "Most onboarding requests ask for calendar setup and budget guidance.",
        "created_at": "2026-03-24T18:30:00Z",
    },
]
