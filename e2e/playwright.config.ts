import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  testIgnore: "fixture/**",
  expect: { timeout: 20000 },
  use: { baseURL: "http://127.0.0.1:5005", trace: "on-first-retry" },
  webServer: { command: "pnpm -w serve:web", url: "http://127.0.0.1:5005", reuseExistingServer: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
