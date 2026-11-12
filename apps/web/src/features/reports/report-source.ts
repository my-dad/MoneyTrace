/** Period reports. No read model carries these yet, so only a fixture implements it for now. */

export type PeriodKind = "calendarMonth" | "salaryCycle";

export type PeriodReport = {
  label: string; // "November 2026" or "25 Oct – 24 Nov"
  incomeMinor: number;
  expenseMinor: number;
  /** Cash with no known place. Never part of expenseMinor. */
  unexplainedCashMinor: number;
  /** Spending over the same days of the previous period; null when there is nothing earlier. */
  comparison: { name: string; expenseMinor: number } | null;
  categories: { category: string; amountMinor: number; previousMinor: number }[];
  movements: { accountId: string; name: string; inMinor: number; outMinor: number }[];
  cards: { accountId: string; name: string; owedMinor: number; dueDate: string }[];
  /** Differences, unplaced cash and waiting items, left out of the totals until resolved. */
  unsettled: { id: string; title: string; detail: string; amountMinor: number }[];
};

export type ReportSource = {
  /** Display names for a period, available even when it has no data. */
  period: (kind: PeriodKind, offset: number) => { label: string; detail: string };
  /** offset 0 = current, -1 = previous; null = nothing recorded in that period. */
  load: (kind: PeriodKind, offset: number) => Promise<PeriodReport | null>;
};
