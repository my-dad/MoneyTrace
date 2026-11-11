import { defineConfig, devices } from "@playwright/test";

/** Fixture (demo) mode: no emulators, no sign-in. Built with NEXT_PUBLIC_DATA_SOURCE=fixture. */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  expect: { timeout: 20000 },
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: { command: "pnpm --filter web start", url: "http://127.0.0.1:3000", reuseExistingServer: false },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
});
