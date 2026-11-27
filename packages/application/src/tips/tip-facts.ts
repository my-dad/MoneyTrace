import {
  dhakaDay,
  formatBdt,
  MAX_TIPS,
  monthRange,
  netOf,
  percentFromBp,
  sameTimeLastMonthMs,
  SECTOR_IDS,
  SECTOR_LABELS,
  sectorShares,
  sectorTotals,
  type FigureEntry,
  type SectorId,
  type TipFact,
} from "@moneytrace/contracts";

const DAY_MS = 86_400_000;
/** ৳500, the smallest difference or amount worth a tip. */
const MIN_NOTABLE_MINOR = 50_000;
const MIN_SPENDS = 5;
const MIN_DAYS_TRACKED = 14;

export type TipFactsInput = {
  nowMs: number;
  /** Expense-account entries from the previous month's start to now. */
  expenses: readonly FigureEntry[];
  /** Income-account entries this month. */
  income: readonly FigureEntry[];
  /** The withdrawn cash with no known place yet, never below zero. */
  unexplainedCashMinor: number;
};

export type TipFactsResult = { status: "notEnoughData" } | { status: "ready"; facts: TipFact[] };

/** A whole percentage, rounded half up, from integers only. */
export function percentOf(part: number, whole: number): number {
  return Math.floor((part * 200 + whole) / (whole * 2));
}

const REV = ":rev";

/** Spends that stand: no reversal, and no original that a reversal cancelled. */
function standingSpends(expenses: readonly FigureEntry[]): FigureEntry[] {
  const reversed = new Set(expenses.filter((e) => e.transactionId.endsWith(REV)).map((e) => e.transactionId.slice(0, -REV.length)));
  return expenses.filter((e) => e.side === "debit" && !e.transactionId.endsWith(REV) && !reversed.has(e.transactionId));
}

const sectorOrder = (s: SectorId): number => SECTOR_IDS.indexOf(s);

type Move = { sector: SectorId; current: number; previous: number; diff: number };

/** The biggest move in one direction, ties to the sector list's order. */
function biggest(moves: Move[]): Move | undefined {
  return [...moves].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || sectorOrder(a.sector) - sectorOrder(b.sector))[0];
}

/**
 * Up to three figures worth a tip for the month so far, worded by our code. The same rules as
 * the dashboard's tiles (shared from contracts), so a tip never disagrees with them.
 */
export function tipFacts(input: TipFactsInput): TipFactsResult {
  const { nowMs } = input;
  const month = monthRange(nowMs, 0);
  const prior = monthRange(nowMs, -1);
  const cutoff = sameTimeLastMonthMs(nowMs);
  const current = input.expenses.filter((e) => e.occurredAtMs >= month.fromMs && e.occurredAtMs <= nowMs);
  const previous = input.expenses.filter((e) => e.occurredAtMs >= prior.fromMs && e.occurredAtMs <= cutoff);

  const standing = standingSpends(input.expenses);
  const spendsThisMonth = new Set(standing.filter((e) => e.occurredAtMs >= month.fromMs && e.occurredAtMs <= nowMs).map((e) => e.transactionId)).size;
  const firstSpendMs = Math.min(...standing.map((e) => e.occurredAtMs));
  if (spendsThisMonth < MIN_SPENDS || nowMs - firstSpendMs < MIN_DAYS_TRACKED * DAY_MS) return { status: "notEnoughData" };

  const today = dhakaDay(nowMs);
  const by = `by ${String(Number(today.slice(8, 10)))} ${month.label.slice(0, 3)}`;
  const priorName = prior.label.split(" ")[0] ?? "";

  const now = new Map(sectorTotals(current).map((t) => [t.sector, t.amountMinor]));
  const before = new Map(sectorTotals(previous).map((t) => [t.sector, t.amountMinor]));
  const moves: Move[] = [...new Set([...now.keys(), ...before.keys()])]
    .filter((sector) => sector !== "uncategorized")
    .map((sector) => {
      const cur = now.get(sector) ?? 0;
      const prev = before.get(sector) ?? 0;
      return { sector, current: cur, previous: prev, diff: cur - prev };
    })
    .filter((m) => m.previous > 0 && Math.abs(m.diff) >= MIN_NOTABLE_MINOR && Math.abs(m.diff) * 100 >= m.previous * 20);

  const moveFact = (m: Move, kind: "sectorUp" | "sectorDown"): TipFact => ({
    id: `${kind}:${m.sector}`,
    kind,
    sector: m.sector,
    amountMinor: m.current,
    compareMinor: m.previous,
    headline: `${SECTOR_LABELS[m.sector]} is ${kind === "sectorUp" ? "up" : "down"} on last month`,
    detail: `${formatBdt(m.current)} ${by}, against ${formatBdt(m.previous)} by this time in ${priorName}`,
  });

  const spent = netOf(current, "debit");
  const cameIn = netOf(input.income, "credit");
  const unsortedMinor = now.get("uncategorized") ?? 0;
  // The chart's own shares, so the percent here is the one the chart shows.
  const top = sectorShares(current).filter((t) => t.sector !== "uncategorized")[0];

  const up = biggest(moves.filter((m) => m.diff > 0));
  const down = biggest(moves.filter((m) => m.diff < 0));
  const candidates: (TipFact | undefined)[] = [
    up === undefined ? undefined : moveFact(up, "sectorUp"),
    spent > cameIn && cameIn > 0
      ? {
          id: "spentOverCameIn",
          kind: "spentOverCameIn",
          amountMinor: spent,
          compareMinor: cameIn,
          headline: "Spending is ahead of income",
          detail: `${formatBdt(spent)} spent, ${formatBdt(cameIn)} came in so far this month`,
        }
      : undefined,
    unsortedMinor >= MIN_NOTABLE_MINOR
      ? { id: "unsorted", kind: "unsorted", amountMinor: unsortedMinor, headline: `${formatBdt(unsortedMinor)} isn't sorted yet`, detail: "Sorting it shows where it went" }
      : undefined,
    input.unexplainedCashMinor > 0
      ? {
          id: "unexplainedCash",
          kind: "unexplainedCash",
          amountMinor: input.unexplainedCashMinor,
          headline: `${formatBdt(input.unexplainedCashMinor)} cash isn't explained yet`,
          detail: "Counting your cash keeps the picture right",
        }
      : undefined,
    top !== undefined && spent > 0 && top.amountMinor * 100 >= spent * 30
      ? {
          id: `topSector:${top.sector}`,
          kind: "topSector",
          sector: top.sector,
          amountMinor: top.amountMinor,
          compareMinor: spent,
          headline: `${SECTOR_LABELS[top.sector]} took ${String(percentFromBp(top.shareBp))}% of spending`,
          detail: `${formatBdt(top.amountMinor)} of ${formatBdt(spent)} this month`,
        }
      : undefined,
    down === undefined ? undefined : moveFact(down, "sectorDown"),
  ];
  return { status: "ready", facts: candidates.filter((f): f is TipFact => f !== undefined).slice(0, MAX_TIPS) };
}
