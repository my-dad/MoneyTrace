import { expect, test, type Page } from "@playwright/test";

// SMS in the corpus formats, dated today in Dhaka so they land in the dashboard's current month.
const dhaka = (offsetMinutes: number) => new Date(Date.now() + 6 * 3_600_000 - offsetMinutes * 60_000);
const pad = (n: number) => String(n).padStart(2, "0");
const ddmmyy = (d: Date, sep: string) => `${pad(d.getUTCDate())}${sep}${pad(d.getUTCMonth() + 1)}${sep}${String(d.getUTCFullYear()).slice(2)}`;
const hhmm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const twelve = (d: Date) => `${pad(((d.getUTCHours() + 11) % 12) + 1)}:${pad(d.getUTCMinutes())} ${d.getUTCHours() < 12 ? "AM" : "PM"}`;

const salary = (d: Date) => `TK 15,000.00 credited to A/C#12345**8888 on ${ddmmyy(d, "-")} @${twelve(d)} from OTHER BANK. Balance TK 0.00. BRAC Bank.`;
const cardPurchase = (d: Date) => `BDT 1,900 transacted at EXAMPLE PHARMA on ${ddmmyy(d, "/")} [${twelve(d).replace(" ", ":00 ")} BST] using Card#***9999. Available balance: BDT 60,000.5. Helpline 16221`;
const debitCard = (d: Date) => `Your UCB Debit Card#7777 (CL ID:7654321) has been charged for BDT1,700.00 at EXAMPLE SUPERSHOP on ${ddmmyy(d, "/")} ${hhmm(d)}. Avl Bal:90000.40. For query:16419`;
const bkashIn = (d: Date) => `You have received deposit from iBanking of Tk 1,700.00 from ECB. Fee Tk 0.00. Balance Tk 1,900.50. TrxID BK00000003 at ${ddmmyy(d, "/").slice(0, 6)}20${ddmmyy(d, "/").slice(6)} ${hhmm(d)}`;

async function paste(page: Page, text: string) {
  await page.getByRole("button", { name: /Open chat/ }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await chat.getByLabel("Message MoneyTrace").fill(text);
  await chat.getByLabel("Message MoneyTrace").press("Enter");
  await expect(chat.getByText("Recorded").last()).toBeVisible({ timeout: 45_000 });
  await page.keyboard.press("Escape");
}

test("SMS are read for their source: Came in, Spent, and an own transfer counted in neither", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.getByText("Paste a bank SMS or tell me about a purchase to get started.")).toBeVisible();

  await paste(page, salary(dhaka(60)));
  await expect(page.getByRole("group", { name: "Came in" })).toContainText("৳15,000");
  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.getByText("BRAC ••8888").first()).toBeVisible();

  await paste(page, cardPurchase(dhaka(50)));
  await expect(page.getByRole("group", { name: "Spent" })).toContainText("৳1,900");
  await expect(recent.getByText("BRAC card ••9999").first()).toBeVisible();

  // Out of the UCB card and into bKash ten minutes apart: the user's own transfer (CR-008).
  await paste(page, debitCard(dhaka(30)));
  await paste(page, bkashIn(dhaka(20)));
  await expect(recent.getByText("Transfer").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("group", { name: "Spent" })).toContainText("৳1,900");
  await expect(page.getByRole("group", { name: "Came in" })).toContainText("৳15,000");
});
