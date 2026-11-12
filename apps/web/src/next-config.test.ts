import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const OLD_ROUTES = ["/chat", "/activity", "/accounts", "/accounts/new", "/reports", "/reminders", "/settings", "/onboarding"];

type Hosting = {
  public: string;
  redirects: { source: string; destination: string; type: number }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const hosting = (JSON.parse(readFileSync(join(import.meta.dirname, "../../../firebase.json"), "utf8")) as { hosting: Hosting }).hosting;
const headerOf = (source: string, key: string) =>
  hosting.headers.find((h) => h.source === source)?.headers.find((h) => h.key === key)?.value;

describe("web hosting (release blocker B1)", () => {
  it("builds a static export that Firebase Hosting serves", () => {
    expect(nextConfig.output).toBe("export");
    expect(hosting.public).toBe("apps/web/out");
  });

  it("redirects every old route to the dashboard", () => {
    expect(hosting.redirects.map((r) => r.source).sort()).toEqual([...OLD_ROUTES].sort());
    expect(hosting.redirects.every((r) => r.destination === "/" && r.type === 302)).toBe(true);
  });

  it("never caches the service worker, so updates reach the phone", () => {
    expect(headerOf("/sw.js", "Cache-Control")).toBe("no-cache");
  });

  it("sends basic security headers on every page", () => {
    expect(headerOf("**", "X-Content-Type-Options")).toBe("nosniff");
    expect(headerOf("**", "X-Frame-Options")).toBe("DENY");
    expect(headerOf("**", "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("deploy commands (release blocker B3)", () => {
  const scripts = (JSON.parse(readFileSync(join(import.meta.dirname, "../../../package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

  it.each([["deploy:dev", "dev"], ["deploy:prod", "prod"]])("%s builds both apps and deploys rules, functions and hosting to %s", (name, alias) => {
    const script = scripts[name] ?? "";
    expect(script).toContain("pnpm build:functions");
    expect(script).toContain("pnpm --filter web build");
    expect(script).toContain(`firebase deploy --project ${alias} --only firestore,storage,functions,hosting`);
  });
});

describe("environments (Mabrur, 2026-11-13: dev and prod)", () => {
  it("has dev and prod aliases and no staging deploy", () => {
    const rc = JSON.parse(readFileSync(join(import.meta.dirname, "../../../.firebaserc"), "utf8")) as { projects: Record<string, string> };
    const scripts = (JSON.parse(readFileSync(join(import.meta.dirname, "../../../package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(rc.projects["dev"]).toBe("moneytrace-staging");
    expect(rc.projects).not.toHaveProperty("staging");
    expect(scripts).not.toHaveProperty("deploy:staging");
  });
});
