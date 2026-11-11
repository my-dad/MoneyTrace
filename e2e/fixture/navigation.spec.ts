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

test("opening an activity item shows its detail", async ({ page }) => {
  await page.goto("/activity");
  await page.getByRole("button", { name: /Transfer: Bank → Cash/ }).click();
  await expect(page).toHaveURL(/\/activity\?id=se-atm$/);
  const detail = page.getByRole("region", { name: "Transaction detail" });
  await expect(detail.getByText("Bank down, cash up · not spending")).toBeVisible();
  await detail.getByRole("button", { name: "Correct or reverse" }).click();
  await page.getByRole("radio", { name: "Reverse it" }).check();
  await page.getByLabel("Why? (required)").fill("Testing the demo");
  await page.getByRole("button", { name: "Save reversal" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Not available yet — demo · nothing was saved");
});
