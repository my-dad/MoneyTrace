import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const OLD_ROUTES = ["/chat", "/activity", "/accounts", "/accounts/new", "/reports", "/reminders", "/settings", "/onboarding"];

describe("next config", () => {
  it("redirects every old route to the dashboard", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.map((r) => r.source).sort()).toEqual([...OLD_ROUTES].sort());
    expect(redirects.every((r) => r.destination === "/" && r.permanent === false)).toBe(true);
  });
});
