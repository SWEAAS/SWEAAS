# `frontend/src/` — application source

Quick map for navigation and **AI prompts** (pair with [`docs/PROMPTS_AND_AI.md`](../../docs/PROMPTS_AND_AI.md)).

| Directory | Contents |
|-----------|----------|
| `api/` | Axios client — **single place** for `/api/v1` calls (`client.ts`) |
| `store/` | Zustand global state |
| `views/` | Route-level pages |
| `components/` | Reusable UI (layout, dashboard widgets) |
| `three/` | React Three Fiber 3D HQ (`HQView`, scene, avatars, overlays) |
| `styles/` | Tailwind v4 entry (`globals.css`) |

Routing lives in `App.tsx`. Auth gate: `ProtectedRoute` + `authStore`.
