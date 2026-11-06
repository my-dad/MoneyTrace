import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ["**/*.emulator.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
  },
});
