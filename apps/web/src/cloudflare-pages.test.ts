import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const OLD_ROUTES = ["/chat", "/activity", "/accounts", "/accounts/new", "/reports", "/reminders", "/settings", "/onboarding"];
const pub = (name: string) => readFileSync(join(import.meta.dirname, "../public", name), "utf8");
const lines = (text: string) => text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
/** The `Name: value` lines under one `_headers` path block. */
const headersFor = (path: string) => {
  const block = pub("_headers")
    .split(/\n(?=\/)/)
    .find((s) => s.trimStart().startsWith(`${path}\n`));
  return Object.fromEntries(
    (block ?? "")
      .split("\n")
      .slice(1)
      .filter((l) => l.includes(":"))
      .map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]),
  );
};

describe("web hosting on Cloudflare Pages (CR-010; release blocker B1)", () => {
  it("builds a static export", () => {
    expect(nextConfig.output).toBe("export");
  });

  it("redirects every old screen to the dashboard (PRD CR-007)", () => {
    const rules = lines(pub("_redirects")).map((l) => l.trim().split(/\s+/));
    expect(rules.map((r) => r[0]).sort()).toEqual([...OLD_ROUTES].sort());
    expect(rules.every((r) => r[1] === "/" && r[2] === "302")).toBe(true);
  });

  it("never caches the service worker, so updates reach the phone", () => {
    expect(headersFor("/sw.js")["Cache-Control"]).toBe("no-cache");
  });

  it("sends basic security headers on every page", () => {
    expect(headersFor("/*")).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  });
});
