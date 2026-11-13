import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const fixtures = "tooling/boundaries/fixtures";

function cruise(file: string) {
  const r = spawnSync(
    "pnpm",
    ["exec", "depcruise", `${fixtures}/${file}`, "--config", ".dependency-cruiser.cjs"],
    { cwd: root, encoding: "utf8" },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const violations: [string, string][] = [
  ["packages/domain/src/uses-zod.ts", "domain-no-dependencies"],
  ["packages/domain/src/uses-node.ts", "domain-no-dependencies"],
  ["packages/application/src/uses-postgres.ts", "application-only-domain-contracts"],
  ["packages/application/src/uses-infra.ts", "application-only-domain-contracts"],
  ["packages/application/src/testing/uses-postgres.ts", "application-testing-only-test-libs"],
  ["packages/contracts/src/uses-domain.ts", "contracts-only-zod"],
  ["apps/web/src/uses-postgres.ts", "web-no-server-code"],
  ["packages/ui-kit/src/uses-supabase.tsx", "ui-kit-only-react"],
  ["packages/ui-kit/src/uses-contracts.ts", "ui-kit-only-react"],
];

const clean = [
  "packages/domain/src/clean.ts",
  "packages/contracts/src/ok.ts",
  "packages/domain/src/ok.test.ts",
  "packages/application/src/testing/ok.ts",
  "packages/application/src/testing/ok2.ts",
  "apps/functions/src/composition-ok.ts",
  "packages/ui-kit/src/ok.tsx",
];

/** Each case spawns depcruise, which can take several seconds while the full suite is running. */
const CRUISE_TIMEOUT_MS = 30_000;

describe("layer boundaries", () => {
  it.each(violations)("%s violates %s", (file, rule) => {
    const { code, out } = cruise(file);
    expect(code).not.toBe(0);
    expect(out).toContain(rule);
  }, CRUISE_TIMEOUT_MS);

  it.each(clean)("%s is allowed", (file) => {
    const { code, out } = cruise(file);
    expect(out).not.toMatch(/error/i);
    expect(code).toBe(0);
  }, CRUISE_TIMEOUT_MS);
});
