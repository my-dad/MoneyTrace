import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const here = import.meta.dirname;
const dist = join(here, "dist");

describe("functions build", () => {
  beforeAll(() => {
    const r = spawnSync("node", ["build.mjs"], { cwd: here, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  }, 60_000);

  it("writes a deployable package.json with only the two pinned external dependencies", () => {
    const text = readFileSync(join(dist, "package.json"), "utf8");
    expect(text).not.toContain("workspace:");
    expect(JSON.parse(text)).toEqual({
      name: "moneytrace-functions",
      private: true,
      main: "index.js",
      type: "module",
      engines: { node: "22" },
      dependencies: { "firebase-admin": "14.5.0", "firebase-functions": "7.4.0" },
    });
  });

  it("bundles every workspace package, leaving only the two external imports", () => {
    const js = readFileSync(join(dist, "index.js"), "utf8");
    expect(js).not.toMatch(/@moneytrace\//);
    expect(js).toMatch(/from "firebase-functions/);
    expect(js).toMatch(/from "firebase-admin/);
  });
});
