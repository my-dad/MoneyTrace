import { expect, test } from "@playwright/test";

test("SMS to posted: paste evidence and see the chat route", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page).toHaveTitle(/MoneyTrace/);
  await expect(page.getByPlaceholder(/bank SMS/i)).toBeVisible();
});
