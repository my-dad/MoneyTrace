import { sectorShares, type SectorId } from "@moneytrace/contracts";
import { dhakaDate } from "../../shared/dhaka-date";
import type { LedgerEntryRow } from "../../shared/read-model-gateway";
import type { MerchantRow } from "./dashboard-view-model";

export type SectorSlice = { sector: SectorId; amountMinor: number; shareBp: number };
export type DayPoint = { day: number; minor: number };
export type MonthTotal = { label: string; inMinor: number; outMinor: number };
type Range = { label: string; fromMs: number; toMs: number };

const signed = (row: LedgerEntryRow, positive: "debit" | "credit"): number => (row.side === positive ? row.amountMinor : -row.amountMinor);

/**
 * Spending per sector, biggest first, with each share in basis points. Shares use the
 * largest-remainder method on integers, so they always sum to exactly 10000. Sectors at zero or
 * below (refunds covering spending) are left out: a chart never shows a negative slice.
 */
export function sectorSlices(expenses: LedgerEntryRow[]): SectorSlice[] {
  return sectorShares(expenses);
}

const dayOfMonth = (ms: number): number => Number(dhakaDate(ms).slice(8, 10));

/** Spending added up day by day (Dhaka days), through today for the current month, else the whole month. */
export function dailyCumulative(expenses: LedgerEntryRow[], month: Pick<Range, "fromMs" | "toMs">, nowMs: number): DayPoint[] {
  const lastDay = nowMs >= month.fromMs && nowMs <= month.toMs ? dayOfMonth(nowMs) : dayOfMonth(month.toMs);
  const perDay = new Map<number, number>();
  for (const row of expenses) {
    if (row.occurredAtMs < month.fromMs || row.occurredAtMs > month.toMs) continue;
    const day = dayOfMonth(row.occurredAtMs);
    perDay.set(day, (perDay.get(day) ?? 0) + signed(row, "debit"));
  }
  const points: DayPoint[] = [];
  let running = 0;
  for (let day = 1; day <= lastDay; day++) {
    running += perDay.get(day) ?? 0;
    points.push({ day, minor: running });
  }
  return points;
}

/** Came in and Spent per month, each netting its corrections and refunds. */
export function monthlyTotals(expenses: LedgerEntryRow[], income: LedgerEntryRow[], months: Range[]): MonthTotal[] {
  const within = (rows: LedgerEntryRow[], m: Range) => rows.filter((r) => r.occurredAtMs >= m.fromMs && r.occurredAtMs <= m.toMs);
  return months.map((m) => ({
    label: m.label,
    inMinor: Math.max(0, within(income, m).reduce((sum, r) => sum + signed(r, "credit"), 0)),
    outMinor: Math.max(0, within(expenses, m).reduce((sum, r) => sum + signed(r, "debit"), 0)),
  }));
}

/** The merchants taking the most, at most `n`. */
export const topMerchants = (rows: MerchantRow[], n = 5): MerchantRow[] => rows.slice(0, n);
