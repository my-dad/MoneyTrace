import { expect, test } from "@playwright/test";

const demoMarker = (page: import("@playwright/test").Page) => page.getByRole("note").filter({ hasText: "Demo data" });

test("the dashboard shows the demo month", async ({ page }) => {
  await page.goto("/");
  await expect(demoMarker(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Spent" })).toContainText("৳18,640");
  await expect(page.getByRole("note", { name: "Cash not yet explained" })).toContainText("৳5,000");
  await expect(page.getByRole("region", { name: "Where it went" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("৳1,740 more than this time last month")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Net money" })).toContainText("৳1,25,630");
  await expect(page.getByRole("region", { name: "Recent" }).getByText("Transfer", { exact: true }).first()).toBeVisible();
});

test("the chat opens, a demo send says nothing was saved, Escape closes it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open chat, 2 questions waiting" }).click();
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

test("the menu shows AI spend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText("$1.43 used this month")).toBeVisible();
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
