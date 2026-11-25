import type { SectorId } from "@moneytrace/contracts";
import { dhakaDate } from "../../shared/dhaka-date";
import type { LedgerEntryRow } from "../../shared/read-model-gateway";
import { categoryOf, type MerchantRow } from "./dashboard-view-model";

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
  const totals = new Map<SectorId, number>();
  for (const row of expenses) totals.set(categoryOf(row.accountId), (totals.get(categoryOf(row.accountId)) ?? 0) + signed(row, "debit"));
  const rows = [...totals].filter(([, minor]) => minor > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((sum, [, minor]) => sum + minor, 0);
  if (total === 0) return [];
  const exact = rows.map(([sector, minor]) => {
    const scaled = minor * 10_000;
    return { sector, amountMinor: minor, floor: (scaled - (scaled % total)) / total, remainder: scaled % total };
  });
  let left = 10_000 - exact.reduce((sum, r) => sum + r.floor, 0);
  const byRemainder = [...exact].sort((a, b) => b.remainder - a.remainder);
  const bonus = new Set<SectorId>();
  for (const r of byRemainder) {
    if (left <= 0) break;
    bonus.add(r.sector);
    left -= 1;
  }
  return exact.map((r) => ({ sector: r.sector, amountMinor: r.amountMinor, shareBp: r.floor + (bonus.has(r.sector) ? 1 : 0) }));
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
