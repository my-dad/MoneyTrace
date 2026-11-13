import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.emulator.test.ts", "packages/infrastructure/test/*.store.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
  },
});
