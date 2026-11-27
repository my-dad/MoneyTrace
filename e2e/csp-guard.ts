import { expect, test as base } from "@playwright/test";

/**
 * Playwright's `test`, failing any test in which the browser blocked something under our
 * Content-Security-Policy (apps/web/scripts/write-csp.mjs). A blocked script or connection may
 * not break the path a test checks, so passing tests alone don't prove the policy fits the app.
 */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (m) => {
        if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
      });
      await use(undefined);
      expect(violations, "the Content-Security-Policy blocked something").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
