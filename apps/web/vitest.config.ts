import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { TEST_FIREBASE_ENV } from "../../tooling/test-firebase-env";

export default defineConfig({
  plugins: [react()],
  test: {
    env: TEST_FIREBASE_ENV,
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.emulator.test.ts"],
  },
});
