import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { TEST_FIREBASE_ENV } from "./tooling/test-firebase-env";

export default defineConfig({
  plugins: [react()],
  oxc: false,
  test: {
    env: TEST_FIREBASE_ENV,
    passWithNoTests: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/*.emulator.test.ts", "**/node_modules/**", "tooling/boundaries/fixtures/**"],
  },
});
