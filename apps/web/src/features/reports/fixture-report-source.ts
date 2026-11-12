import { FIXTURE_EXPENSE_ENTRIES } from "../../shared/fixtures/household";
import type { PeriodKind, PeriodReport, ReportSource } from "./report-source";

/** Report figures for the demo household. They agree with the household's balances and expense entries. */

const taka = (amount: number): number => amount * 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// The fixture's "now" is in November 2026 (month index 10). The salary cycle starts on the 25th.
const NOW_YEAR = 2026;
const NOW_MONTH = 10;
const CYCLE_START_DAY = 25;

const monthAt = (offset: number) => {
  const index = NOW_YEAR * 12 + NOW_MONTH + offset;
  return { year: Math.floor(index / 12), month: index % 12 };
};

function period(kind: PeriodKind, offset: number): { label: string; detail: string } {
  if (kind === "calendarMonth") {
    const { year, month } = monthAt(offset);
    return { label: `${LONG_MONTHS[month] ?? ""} ${String(year)}`, detail: offset === 0 ? "1–6 Nov · month so far" : "Whole month" };
  }
  const start = monthAt(offset - 1).month;
  const end = monthAt(offset).month;
  return {
    label: `${String(CYCLE_START_DAY)} ${MONTHS[start] ?? ""} – ${String(CYCLE_START_DAY - 1)} ${MONTHS[end] ?? ""}`,
    detail: offset === 0 ? `Cycle so far · starts on the ${String(CYCLE_START_DAY)}th` : "Whole cycle",
  };
}

const ORDER = ["groceries", "other", "transport", "eating-out"];

/** November so far, summed from the household's expense entries. */
function novemberCategories(): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const entry of FIXTURE_EXPENSE_ENTRIES.filter((e) => e.occurredAtMs >= Date.parse("2026-11-01T00:00:00+06:00"))) {
    const category = entry.accountId.replace(/^expense-/, "");
    sums[category] = (sums[category] ?? 0) + entry.amountMinor;
  }
  return sums;
}

function categories(amounts: Record<string, number>, previous: Record<string, number>): PeriodReport["categories"] {
  return ORDER.map((category) => ({ category, amountMinor: amounts[category] ?? 0, previousMinor: previous[category] ?? 0 }))
    .filter((row) => row.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

const inTaka = (values: Record<string, number>) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, taka(value)]));

const OCT_SAME_DAYS = inTaka({ groceries: 6_100, other: 5_200, transport: 2_950, "eating-out": 2_650 }); // 16,900
const OCT_WHOLE = inTaka({ groceries: 18_900, other: 15_600, transport: 9_700, "eating-out": 8_100 }); // 52,300
const OCT_LAST_WEEK = inTaka({ groceries: 2_400, other: 1_900, transport: 1_100, "eating-out": 875 }); // 6,275
const LAST_CYCLE_SAME_DAYS = inTaka({ groceries: 9_900, other: 8_400, transport: 4_700, "eating-out": 4_030 }); // 27,030

const add = (a: Record<string, number>, b: Record<string, number>, sign = 1) =>
  Object.fromEntries(ORDER.map((key) => [key, (a[key] ?? 0) + sign * (b[key] ?? 0)]));

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);

const CURRENT_MOVEMENTS: PeriodReport["movements"] = [
  { accountId: "bank-dbbl", name: "DBBL Savings", inMinor: taka(85_000), outMinor: taka(5_000) },
  { accountId: "bank-city", name: "City Bank Current", inMinor: 0, outMinor: taka(2_500) },
  { accountId: "bank-bkash", name: "bKash", inMinor: 0, outMinor: taka(950) },
  { accountId: "cash-wallet", name: "Wallet", inMinor: 0, outMinor: taka(650) },
  { accountId: "cash-unassigned", name: "Cash · not yet explained", inMinor: taka(5_000), outMinor: 0 },
];

const CURRENT_CARDS: PeriodReport["cards"] = [
  { accountId: "card-amex", name: "City Bank Amex", owedMinor: taka(18_450), dueDate: "2026-11-15" },
  { accountId: "card-ebl", name: "EBL Visa", owedMinor: taka(6_120), dueDate: "2026-11-22" },
];

const CURRENT_UNSETTLED: PeriodReport["unsettled"] = [
  { id: "fu-home-count", title: "Home cash counted less than expected", detail: "Snoozed until 1 Dec · not counted as spending", amountMinor: taka(300) },
  { id: "fu-atm", title: "ATM cash with no place yet", detail: "Needs your answer", amountMinor: taka(5_000) },
  { id: "se-pending-agora", title: "Agora Dhanmondi card purchase", detail: "Waiting for your answer · not included above", amountMinor: taka(1_870) },
];

const PAST_MOVEMENTS: PeriodReport["movements"] = [
  { accountId: "bank-dbbl", name: "DBBL Savings", inMinor: taka(85_000), outMinor: taka(40_000) },
  { accountId: "cash-wallet", name: "Wallet", inMinor: taka(20_000), outMinor: taka(14_800) },
];

function report(kind: PeriodKind, offset: number): PeriodReport | null {
  const { label } = period(kind, offset);
  const november = novemberCategories();
  const current = offset === 0;
  if (offset !== 0 && offset !== -1) return null;
  const amounts =
    kind === "calendarMonth"
      ? current ? november : OCT_WHOLE
      : current ? add(november, OCT_LAST_WEEK) : add(OCT_WHOLE, OCT_LAST_WEEK, -1);
  const previous = current ? (kind === "calendarMonth" ? OCT_SAME_DAYS : LAST_CYCLE_SAME_DAYS) : {};
  return {
    label,
    incomeMinor: taka(85_000),
    expenseMinor: sum(amounts),
    unexplainedCashMinor: current ? taka(5_000) : 0,
    comparison: current ? { name: kind === "calendarMonth" ? "October" : "the last cycle", expenseMinor: sum(previous) } : null,
    categories: categories(amounts, previous),
    movements: current ? CURRENT_MOVEMENTS : PAST_MOVEMENTS,
    cards: current ? CURRENT_CARDS : [],
    unsettled: current ? CURRENT_UNSETTLED : [],
  };
}

export function createFixtureReportSource(): ReportSource {
  return { period, load: (kind, offset) => Promise.resolve(report(kind, offset)) };
}
