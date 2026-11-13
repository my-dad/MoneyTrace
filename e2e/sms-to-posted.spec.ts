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
  // Wait for THIS message to be recorded: earlier replies already say "Recorded" (each reply
  // shows it in more than one place, so wait for the count to grow).
  const before = await chat.getByText("Recorded").count();
  await chat.getByLabel("Message MoneyTrace").fill(text);
  await chat.getByLabel("Message MoneyTrace").press("Enter");
  await expect.poll(() => chat.getByText("Recorded").count(), { timeout: 45_000 }).toBeGreaterThan(before);
  await page.keyboard.press("Escape");
}

test("SMS are read for their source: Came in, Spent, and an own transfer counted in neither", async ({ page }) => {
  // Four SMS through the emulated pipeline, then the split: longer than the 30 s default.
  test.setTimeout(120_000);
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

  // Not a transfer (CR-008 §9): the two SMS are counted separately again.
  await page.getByRole("button", { name: /Open chat/ }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await chat.getByRole("button", { name: "Not a transfer?" }).click();
  await chat.getByRole("button", { name: "Yes, count separately" }).click();
  await expect(chat.getByText("Recorded · Counted separately: Spent ৳1,700 and Came in ৳1,700.")).toBeVisible({ timeout: 45_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Spent" })).toContainText("৳3,600");
  await expect(page.getByRole("group", { name: "Came in" })).toContainText("৳16,700");
});

test("a cash count shows the gap without changing anything, and Adjust needs a reason (gate 32)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await page.getByRole("button", { name: /Open chat/ }).click();
  const chat = page.getByRole("dialog", { name: "Chat" });
  await chat.getByRole("button", { name: "Count my cash" }).click();
  await chat.getByLabel("Cash you have, in taka").fill("500");
  await chat.getByRole("button", { name: "Check" }).click();
  await expect(chat.getByText("৳500 more than expected")).toBeVisible({ timeout: 45_000 });
  await expect(chat.getByText("Nothing has been changed, and this isn't counted as spending.")).toBeVisible();
  await chat.getByRole("button", { name: "Adjust to my count…" }).click();
  await chat.getByLabel("Why is it different? (required)").fill("cash from before I started");
  await chat.getByRole("button", { name: "Adjust", exact: true }).click();
  await expect(chat.getByText("Recorded · Cash now matches your count of ৳500. The ৳500 adjustment is saved with your reason.")).toBeVisible({ timeout: 45_000 });
});
