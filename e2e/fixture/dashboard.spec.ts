import { expect, test } from "@playwright/test";

const demoMarker = (page: import("@playwright/test").Page) => page.getByRole("note").filter({ hasText: "Demo data" });

test("the dashboard shows the demo month", async ({ page }) => {
  await page.goto("/");
  await expect(demoMarker(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Spent" })).toContainText("৳18,640");
  await expect(page.getByRole("note", { name: "Cash not yet explained" })).toContainText("৳5,000");
  await expect(page.getByRole("region", { name: "Where it went" }).getByRole("listitem")).toHaveCount(5);
  await expect(page.getByText("৳1,740 more than this time last month")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Money tracked" })).toContainText("৳1,25,630");
  await expect(page.getByRole("region", { name: "Recent" }).getByText("Transfer", { exact: true }).first()).toBeVisible();
});

test("the chat opens, a demo send says nothing was saved, Escape closes it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Open chat, \d+ waiting for your answer$/ }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await chat.getByLabel("Message MoneyTrace").fill("paid 500 for rickshaw");
  await chat.getByLabel("Message MoneyTrace").press("Enter");
  await expect(chat.getByRole("alert")).toHaveText("Not available yet — demo · nothing was saved");
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open chat/ })).toBeFocused();
});

test("old routes land on the dashboard", async ({ page }) => {
  for (const path of ["/activity", "/settings", "/accounts/new"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("group", { name: "Spent" })).toBeVisible();
  }
});

test("the menu has no AI spend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("AI help this month")).toHaveCount(0);
});

test("Count my cash opens the chat on the count, and the demo saves nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("note", { name: "Cash not yet explained" }).getByRole("button", { name: "Count my cash" }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await expect(chat.getByText("How much cash do you have right now?")).toBeVisible();
  await chat.getByLabel("Cash you have, in taka").fill("2,300");
  await chat.getByRole("button", { name: "Check" }).click();
  await expect(chat.getByRole("alert")).toHaveText("Not available yet — demo · nothing was saved");
});

test("sorting a shop in the demo says nothing was saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("region", { name: "Recent" }).getByRole("button", { name: "Sort Daraz into a sector" }).click();
  await page.getByRole("dialog", { name: "Sort Daraz" }).getByRole("button", { name: "Shopping" }).click();
  await expect(page.getByRole("status").filter({ hasText: "demo" })).toBeVisible();
});

test("adding cash income in the demo says nothing was saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ Add cash income" }).click();
  const form = page.getByRole("dialog", { name: "Add cash income" });
  await form.getByLabel("Amount (৳)").fill("20000");
  await form.getByRole("radio", { name: "House rent" }).check();
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status").filter({ hasText: "demo" })).toBeVisible();
});

test("the dashboard opens on its charts", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Where it went", "Day by day", "Came in vs Spent", "Top shops"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Groceries took 37% of spending")).toBeVisible();
});
