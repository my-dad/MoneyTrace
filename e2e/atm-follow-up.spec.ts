import { expect, test } from "@playwright/test";

test("ATM follow-up: the authenticated chat route is available", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByRole("heading", { name: "MoneyTrace" })).toBeVisible();
});
