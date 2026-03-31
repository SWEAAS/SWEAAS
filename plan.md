# SWE as a Service — Product Plan

> **Core principle:** Both engineers work around a shared FastAPI interface as the primary handoff boundary. Backend and frontend are fully decoupled — all functionality is added by extending the API.

---

## Architecture Overview

```
Three.js Frontend  ←→  Python / FastAPI  ←→  Load Balancer
                            ↑
                         Services
                        (naming conventions, nesting)
                            ↑
                         Endpoints (y-shaped, composable)
```

- **Backend:** Python (FastAPI)
- **Infrastructure:** GCloud / AWS, provisioned via Terraform
- **Repos:** Enterprise GitHub → one repo per user per project
- **Core repos to clone/integrate:**
  - [`nemoclaw`](https://github.com/nemoclaw) — SWE services
  - [`msitarzewski/agency-agents`](https://github.com/msitarzewski/agency-agents) — agent orchestration

---

## Backend

### Infrastructure
- Python + FastAPI
- GCloud / AWS infra via Terraform
- Enterprise GitHub: repo-per-user, repo-per-project model
- Load balancer sitting in front of FastAPI
- Services layer with clear naming conventions and nesting structure
- Composable endpoint design (y-shaped fork in diagram — endpoints branch from shared services)

### Agent Orchestration
- Track token consumption per agent for budget management
- Agents operate autonomously: plan → iterate → ship within a budget set at onboarding
- Budget enforcement: when out of tokens, agent strikes (pauses), with a call to the CTO being optional escalation

### Integrations (Backend Services)
| Service | Purpose |
|---|---|
| **AgentMail** | Emails via AI agent |
| **Calendar invites** | Schedule calls, sync to user calendar |
| **Observability** | Reports + surfacing frontend views |
| **Co** (operator layer) | Coordination across agents |

---

## Frontend

**Target users:** Department heads (Engineering, Marketing, Product)

**Stack:** Three.js (3D interactive exploration)

**Frontend engineer contact:** Tavus (video conferencing integration), Golpo (screen share / AI explainer)

### Features

#### 1. 3JS Interactive Environment
- HQ environment → interactive 3D exploration for department heads
- Click on an agent in the 3D scene to see what it is currently doing (live agent monitoring)
- Visualise token consumption per agent in real time

#### 2. Humanised AI Agent Calls
- Video conferencing integration via **Tavus** — gives agents a human face/voice for CTO calls
- CTO can schedule and join calls with agents directly from the UI
- Calendar integration: collect email → auto-send calendar invites

#### 3. AI Explainer / Infographic Mode
- **Golpo** integration for screen share
- AI explainer mode: agents generate infographic-style videos summarising technical advancements, sprint progress, architecture decisions
- Targeted at non-technical department heads

#### 4. Onboarding → Configuration Flow
- Department selector at onboarding: Engineering / Marketing / Product
- Budget input: set token/spend budget per agent or per project
- Suggest configs based on department type and budget
- Onboarding docs + optional intro call (auto-scheduled via calendar integration)

---

## Agent Behaviour & Autonomy

Agents operate in a fully autonomous loop:

1. **Plan** — decompose task, estimate token cost
2. **Iterate** — develop, test, refine within budget
3. **Strike / Escalate** — if budget exceeded: pause and optionally surface to CTO via call or notification
4. **Report** — observability layer pushes reports to frontend views

Budget is set at onboarding and enforced per-agent. The frontend surfaces live token burn so department heads always know spend vs. progress.

---

## API Design Principles

- FastAPI is the **single handoff boundary** between the two engineers
- All new features are shipped as new endpoints or service extensions — no direct cross-cutting imports between frontend and backend logic
- Services are nested with consistent naming conventions
- Endpoints are composable (y-fork pattern from whiteboard): shared service layer, branching endpoint surface
- Auth, token tracking, and observability are middleware concerns, not per-endpoint logic

---

## Open Items / Next Steps

- [ ] Clone `nemoclaw` and `msitarzewski/agency-agents`, evaluate what to integrate directly vs. wrap
- [ ] Define API contract (OpenAPI spec) as the shared interface before diverging on features
- [ ] Set up GCloud + Terraform skeleton; confirm AWS vs GCloud per service
- [ ] Integrate Tavus API for agent video persona
- [ ] Integrate Golpo for screen share / explainer video generation
- [ ] Build onboarding flow: department selection → budget config → calendar email collection
- [ ] Design token consumption tracking schema (per agent, per project, per department)
- [ ] Define "strike" behaviour: what happens when budget is exhausted (pause, notify, optional call escalation)
- [ ] Three.js scene design: HQ map with clickable agents, token burn overlay
