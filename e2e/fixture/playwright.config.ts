import { defineConfig, devices } from "@playwright/test";

/** Fixture (demo) mode: no emulators, no sign-in. Built with NEXT_PUBLIC_DATA_SOURCE=fixture. */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  expect: { timeout: 20000 },
  use: { baseURL: "http://127.0.0.1:5005", trace: "on-first-retry" },
  webServer: { command: "pnpm -w serve:web", url: "http://127.0.0.1:5005", reuseExistingServer: false },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
});
