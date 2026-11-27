import { foldSector, type SectorId } from "./sectors";

/**
 * The dashboard's figure rules, shared so a tip never disagrees with a tile. Pure: the web app
 * and the server both count with these.
 */

/** What the figure rules need of a ledger entry; both the stored row and the server record fit. */
export type FigureEntry = {
  transactionId: string;
  accountId: string;
  side: "debit" | "credit";
  amountMinor: number;
  occurredAtMs: number;
};

/** The system wallet for withdrawn cash with no known place yet. Its balance is never spending. */
export const SYSTEM_CASH_ACCOUNT_ID = "cash-unassigned";

const HOUR_MS = 3_600_000;
// Dhaka has no daylight saving: always UTC+6.
const DHAKA_OFFSET_MS = 6 * HOUR_MS;
export const MONTH_NAMES: readonly string[] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type DhakaParts = { year: number; month: number; day: number; timeOfDayMs: number };

function dhakaParts(ms: number): DhakaParts {
  const shifted = new Date(ms + DHAKA_OFFSET_MS);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), timeOfDayMs: ms + DHAKA_OFFSET_MS - dayStart };
}

const monthStartMs = (year: number, month: number): number => Date.UTC(year, month, 1) - DHAKA_OFFSET_MS;

/** The calendar day in Dhaka, as `YYYY-MM-DD`. */
export function dhakaDay(ms: number): string {
  const p = dhakaParts(ms);
  return `${String(p.year).padStart(4, "0")}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The Dhaka calendar month `offset` months from the one containing `nowMs`, inclusive bounds. */
export function monthRange(nowMs: number, offset: number): { fromMs: number; toMs: number; label: string } {
  const now = dhakaParts(nowMs);
  const first = new Date(Date.UTC(now.year, now.month + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  return {
    fromMs: monthStartMs(year, month),
    toMs: monthStartMs(year, month + 1) - 1,
    label: `${MONTH_NAMES[month] ?? ""} ${String(year)}`,
  };
}

/** The same day-of-month and time one calendar month earlier, clamped to that month's last day. */
export function sameTimeLastMonthMs(nowMs: number): number {
  const now = dhakaParts(nowMs);
  const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
  return Date.UTC(now.year, now.month - 1, Math.min(now.day, lastDay)) - DHAKA_OFFSET_MS + now.timeOfDayMs;
}

/** Debits minus credits (or the reverse), so refunds and reversals net out. */
export const netOf = (rows: readonly FigureEntry[], positive: "debit" | "credit"): number =>
  rows.reduce((sum, row) => sum + (row.side === positive ? row.amountMinor : -row.amountMinor), 0);

/** "nominal:expense:groceries:BDT" in the ledger, "expense-groceries" in the demo, as a sector. */
export const categoryOf = (accountId: string): SectorId =>
  foldSector(/^nominal:expense:([^:]+):/.exec(accountId)?.[1] ?? accountId.replace(/^expense-/, ""));

/** Spending per sector, biggest first, refunds netted; a sector at zero or below is left out. */
export function sectorTotals(expenses: readonly FigureEntry[]): { sector: SectorId; amountMinor: number }[] {
  const totals = new Map<SectorId, number>();
  for (const row of expenses) {
    const sector = categoryOf(row.accountId);
    totals.set(sector, (totals.get(sector) ?? 0) + (row.side === "debit" ? row.amountMinor : -row.amountMinor));
  }
  return [...totals]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([sector, amountMinor]) => ({ sector, amountMinor }));
}

/**
 * Each sector's share of spending in basis points, by the largest-remainder method on integers,
 * so the shares always sum to exactly 10000. The chart and the tips both use it, so a percent
 * never differs between them.
 */
export function sectorShares(expenses: readonly FigureEntry[]): { sector: SectorId; amountMinor: number; shareBp: number }[] {
  const rows = sectorTotals(expenses);
  const total = rows.reduce((sum, r) => sum + r.amountMinor, 0);
  if (total === 0) return [];
  const exact = rows.map(({ sector, amountMinor }) => {
    const scaled = amountMinor * 10_000;
    return { sector, amountMinor, floor: (scaled - (scaled % total)) / total, remainder: scaled % total };
  });
  let left = 10_000 - exact.reduce((sum, r) => sum + r.floor, 0);
  const bonus = new Set<SectorId>();
  for (const r of [...exact].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break;
    bonus.add(r.sector);
    left -= 1;
  }
  return exact.map((r) => ({ sector: r.sector, amountMinor: r.amountMinor, shareBp: r.floor + (bonus.has(r.sector) ? 1 : 0) }));
}

/** Basis points as a whole percent, rounded half up, in integers: 3659 → 37. */
export const percentFromBp = (bp: number): number => (bp + 50 - ((bp + 50) % 100)) / 100;
