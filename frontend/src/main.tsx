import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { applyTheme, useThemeStore } from "./store/themeStore";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: import.meta.env.MODE === "production" ? 0.2 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Restore persisted brand colour before first paint
applyTheme(useThemeStore.getState().brandHex);

// Suppress known third-party library noise in dev
if (import.meta.env.DEV) {
  // Three.js r168+ deprecation warnings that R3F 9.x triggers internally
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (
      msg.includes("THREE.THREE.Clock") ||
      msg.includes("PCFSoftShadowMap has been deprecated")
    ) return;
    _warn(...args);
  };

  // recharts v3 passes strokeWidth={undefined} to SVG elements internally
  const _error = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    if (msg.includes("Invalid value for prop `strokeWidth`")) return;
    _error(...args);
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
