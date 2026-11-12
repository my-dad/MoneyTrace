import { expect, test } from "@playwright/test";

// A BRAC withdrawal from fixtures/sms/corpus.json. With no accounts yet (CR-006, before piece 2's
// accounts from SMS), the bank can't be matched, so the message waits for the user's answer.
const WITHDRAWAL_SMS =
  "TK 4,000.00 withdrawn from A/C#12345**8888 on 29-03-26 @07:45 PM from EXAMPLE ATM DHAKA BD. Balance TK 14,000.40. BRAC Bank.";

test("sign in, paste an SMS in the pop-up chat, and see it on the dashboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByText("Paste a bank SMS or tell me about a purchase to get started.")).toBeVisible();

  await page.getByRole("button", { name: /Open chat/ }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await chat.getByLabel("Message MoneyTrace").fill(WITHDRAWAL_SMS);
  await chat.getByLabel("Message MoneyTrace").press("Enter");
  await page.keyboard.press("Escape");

  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.getByText("Waiting for your answer")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Paste a bank SMS or tell me about a purchase to get started.")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Spent" })).toHaveCount(0);
});
