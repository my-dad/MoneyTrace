import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  oxc: false,
  test: {
    passWithNoTests: true,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/*.emulator.test.ts", "**/node_modules/**", "tooling/boundaries/fixtures/**"],
  },
});
