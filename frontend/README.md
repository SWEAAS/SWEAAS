# SWEAAS frontend

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · React Three Fiber (Three.js) · Zustand · React Router · Axios

This is the **product UI** for SWEAAS: dashboard, onboarding, settings, **3D “Visit The Office”** HQ, and API integration with the FastAPI backend.

## Prerequisites

- Node.js 18+
- Backend running at `http://localhost:8000` (or set proxy target in `vite.config.ts`)

## Install and run

```bash
cd frontend
npm install
npm run dev
```

- **App:** http://localhost:5173  
- **API proxy:** Vite proxies `/api` → `http://localhost:8000` (see `vite.config.ts`). The Axios client uses `baseURL: "/api/v1"` so browser calls stay same-origin in dev.

## Environment

- No separate `.env` is required for local dev if the proxy is used.
- Production builds (including CI) need **`VITE_API_BASE_URL`** set to your public API base URL (see Firebase deploy below). The client reads it in `src/api/client.ts`.

## Source map (for prompts / new contributors)

| Path | Role |
|------|------|
| `src/main.tsx` | Entry, global CSS |
| `src/App.tsx` | Routes, lazy `HQView` |
| `src/api/client.ts` | Axios instance + **all API methods** (agents, budget, feedback, communication) |
| `src/store/` | Zustand stores (`authStore`, `agentStore`, `budgetStore`, `projectStore`) |
| `src/views/` | Full pages: `DashboardView`, `LoginView`, `OnboardingView`, `SettingsView`, `CTOCallView` |
| `src/components/layout/` | `AppLayout`, `Sidebar`, `Header` |
| `src/components/dashboard/` | Agent cards, charts, task list |
| `src/three/` | 3D HQ: `HQView`, `HQScene`, `Building`, `AgentAvatar`, `controls`, `ui` |

## Customer vs internal UX

- **End users (your customers):** chat should target agent **`sup-cs-01`** via `agentApi.chat('sup-cs-01', message)` — see `api/client.ts`. For video, `communicationApi.customerCall({ topic, user_email })`.  
- **Owners / operators:** dashboard agents, CTO call (`communicationApi.ctoCall`), 3D HQ agent clicks.  
- **Feedback:** `feedbackApi.submit({ title, body, category, ... })` → `POST /api/v1/feedback`.

## Theme

Blue / yellow / white — CSS variables in `src/styles/globals.css` (`@theme`).

## Build

```bash
npm run build
```

Output in `dist/`. Large chunk for `HQView` is expected (Three.js); it is lazy-loaded in `App.tsx`.

## Deploy on AWS Amplify Hosting

Amplify app ID: **`d3rw7tzkg9y12a`** | Custom domain: **sweaas.com** | Region: `us-east-1`.

### How it works

- Amplify Hosting serves the built `dist/` as a static SPA with automatic CDN, HTTPS, and SPA rewrite rules.
- The build-time env var **`VITE_API_BASE_URL=https://api.sweaas.com/api/v1`** is set in Amplify.
- Custom domain `sweaas.com` and `www.sweaas.com` are configured with Amplify-managed TLS certificates.
- DNS is managed via Route 53 (Namecheap NS records point to Route 53).

### Manual deploy

```bash
cd frontend
VITE_API_BASE_URL=https://api.sweaas.com/api/v1 npm run build
zip -r dist.zip dist/
# Upload via Amplify console or AWS CLI
aws amplify create-deployment --app-id d3rw7tzkg9y12a --branch-name main
# Upload zip to the returned URL, then start-deployment
```

### Backend CORS

Ensure **`CORS_ORIGINS`** in `.env` includes `https://sweaas.com` and `https://www.sweaas.com`.

See [local_dev.md](../local_dev.md) for local development setup.

## Lint

```bash
npm run lint
```

## Parent docs

- [Root README](../README.md) — full platform  
- [docs/PROMPTS_AND_AI.md](../docs/PROMPTS_AND_AI.md) — Cursor / LLM prompt templates  

## Stock Vite template note

The original Vite README boilerplate was replaced by this file. For ESLint “type-aware” rules, see inline comments in `eslint.config.js` and the [Vite React TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts).
