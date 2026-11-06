import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/*.emulator.test.ts", "**/node_modules/**", "tooling/boundaries/fixtures/**"],
  },
});
