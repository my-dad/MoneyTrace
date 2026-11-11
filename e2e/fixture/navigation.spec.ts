import { expect, test } from "@playwright/test";

const demoMarker = (page: import("@playwright/test").Page) => page.getByRole("note").filter({ hasText: "Demo data" });

test("every tab and header entry opens, with the Demo data marker visible", async ({ page }) => {
  await page.goto("/");
  await expect(demoMarker(page)).toBeVisible();
  const main = page.getByRole("navigation", { name: "Main" });

  for (const [label, path] of [["Chat", "/chat"], ["Activity", "/activity"], ["Accounts", "/accounts"], ["Reports", "/reports"], ["Home", "/"]] as const) {
    await main.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(demoMarker(page)).toBeVisible();
  }

  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL("/settings");
  await expect(demoMarker(page)).toBeVisible();

  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: /^Reminders/ }).click();
  await expect(page).toHaveURL("/reminders");
  await expect(demoMarker(page)).toBeVisible();
});
