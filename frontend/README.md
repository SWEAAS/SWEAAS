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

## Deploy on Firebase Hosting (Google Cloud)

GCP project: **`sweass`**. Config lives at the repo root: [`firebase.json`](../firebase.json), [`.firebaserc`](../.firebaserc).

### One-time setup

1. In [Firebase Console](https://console.firebase.google.com/), open (or create) project **`sweass`** and enable **Hosting**.
2. Install CLI: `npm install -g firebase-tools` then `firebase login` and `firebase use sweass` (from repo root).
3. **GitHub Actions:** add repository secrets:
   - **`FIREBASE_SERVICE_ACCOUNT_SWEAAS`** — JSON for a service account with permission to deploy Hosting (Firebase Console → Project settings → Service accounts → Generate new private key).
   - **`VITE_API_BASE_URL`** — public API base, e.g. `https://your-api.run.app/api/v1` or `http://YOUR_PUBLIC_IP/api/v1` if you expose the gateway.

### CI

On push to **`main`** (paths under `frontend/`, `firebase.json`, or the workflow file), [`.github/workflows/deploy-firebase-hosting.yml`](../.github/workflows/deploy-firebase-hosting.yml) builds the frontend and deploys to Firebase Hosting.

### Backend CORS

Add your Firebase Hosting origin to the FastAPI **`CORS_ORIGINS`** (e.g. `https://sweass.web.app` and `https://sweass.firebaseapp.com`, plus any custom domain).

See [local_dev.md](../local_dev.md) for LAN access and API hosting options.

## Lint

```bash
npm run lint
```

## Parent docs

- [Root README](../README.md) — full platform  
- [docs/PROMPTS_AND_AI.md](../docs/PROMPTS_AND_AI.md) — Cursor / LLM prompt templates  

## Stock Vite template note

The original Vite README boilerplate was replaced by this file. For ESLint “type-aware” rules, see inline comments in `eslint.config.js` and the [Vite React TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts).
