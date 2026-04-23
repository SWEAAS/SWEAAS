/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate vitest config so the main vite.config.ts doesn't pull the vitest
// type namespace into production builds. The JSDOM env + setup file are just
// enough to smoke-test the HQ view without spinning up a real browser.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Three.js + WebGL contexts don't exist in JSDOM — only import modules
    // that don't trigger WebGL on mount. The smoke test mocks the R3F
    // scenes so nothing here hits the missing WebGL surface.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
