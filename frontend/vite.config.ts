import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";

// Read .env from the repo root (single source of truth — see local_dev.md).
//
// Node's process.env should also inject VITE_* at build time, but we've seen
// node-version-specific flakiness (node 20 in GitHub Actions didn't inline
// process.env.VITE_SUPABASE_URL even when set in the step's env block, which
// shipped a broken bundle that threw "Invalid supabaseUrl" on sweaas.com on
// 2026-04-24). Belt-and-suspenders: explicitly wire any VITE_* value present
// in process.env into Vite's `define` so it's inlined regardless of how
// Vite's own env loader behaves.
const VITE_KEYS = [
  "VITE_API_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SENTRY_DSN",
] as const;

const explicitDefines: Record<string, string> = {};
for (const key of VITE_KEYS) {
  const value = process.env[key];
  if (value && value.trim()) {
    explicitDefines[`import.meta.env.${key}`] = JSON.stringify(value);
  }
}

export default defineConfig({
  envDir: "../",
  build: {
    sourcemap: true,
  },
  define: explicitDefines,
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT || "sweaas-frontend",
            authToken: process.env.SENTRY_AUTH_TOKEN,
          }),
        ]
      : []),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
