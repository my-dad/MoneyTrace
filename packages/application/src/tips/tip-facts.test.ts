import type { FigureEntry, TipFact } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";
import { percentOf, tipFacts, type TipFactsInput } from "./tip-facts";

const DAY_MS = 86_400_000;
/** A wall-clock time in Dhaka (UTC+6) as an instant. */
const dhaka = (y: number, m: number, d: number, h = 12): number => Date.UTC(y, m - 1, d, h - 6);
const NOW = dhaka(2026, 11, 6);

let seq = 0;
const spend = (sector: string, amountMinor: number, occurredAtMs: number, transactionId = `t${String(++seq)}`): FigureEntry => ({
  transactionId,
  accountId: `nominal:expense:${sector}:BDT`,
  side: "debit",
  amountMinor,
  occurredAtMs,
});
const refund = (sector: string, amountMinor: number, occurredAtMs: number, transactionId: string): FigureEntry => ({
  ...spend(sector, amountMinor, occurredAtMs, transactionId),
  side: "credit",
});
const income = (amountMinor: number, occurredAtMs = dhaka(2026, 11, 1)): FigureEntry => ({
  transactionId: `i${String(++seq)}`,
  accountId: "nominal:income:salary:BDT",
  side: "credit",
  amountMinor,
  occurredAtMs,
});

/** `n` small spends this month and one old enough to pass the two-week rule. Never a fact by itself. */
const filler = (n = 5, now = NOW): FigureEntry[] => [
  ...Array.from({ length: n }, (_, i) => spend("other", 100, now - (i + 1) * 3_600_000)),
  spend("other", 100, now - 30 * DAY_MS),
];

const input = (expenses: FigureEntry[], extra: Partial<TipFactsInput> = {}): TipFactsInput => ({
  nowMs: NOW,
  expenses,
  income: [],
  unexplainedCashMinor: 0,
  ...extra,
});

function factsOf(i: TipFactsInput): TipFact[] {
  const result = tipFacts(i);
  if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
  return result.facts;
}
const find = (facts: TipFact[], id: string): TipFact | undefined => facts.find((f) => f.id === id);

describe("tipFacts", () => {
  it("a sector up on last month, worded from our figures", () => {
    const facts = factsOf(input([...filler(), spend("food", 213000, dhaka(2026, 10, 3)), spend("food", 294000, dhaka(2026, 11, 3))]));
    expect(find(facts, "sectorUp:food")).toEqual({
      id: "sectorUp:food",
      kind: "sectorUp",
      sector: "food",
      amountMinor: 294000,
      compareMinor: 213000,
      headline: "Food is up on last month",
      detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October",
    });
  });

  it("up needs both 20% and ৳500", () => {
    const up = (prev: number, cur: number) =>
      find(factsOf(input([...filler(), spend("food", prev, dhaka(2026, 10, 3)), spend("food", cur, dhaka(2026, 11, 3))])), "sectorUp:food");
    expect(up(250000, 300000)).toBeDefined();
    expect(up(250000, 299900)).toBeUndefined();
    expect(up(1000000, 1199900)).toBeUndefined();
  });

  it("a sector new this month is not up", () => {
    expect(find(factsOf(input([...filler(), spend("food", 300000, dhaka(2026, 11, 3))])), "sectorUp:food")).toBeUndefined();
  });

  it("only spending by this time last month is compared", () => {
    const facts = factsOf(input([...filler(), spend("food", 213000, dhaka(2026, 10, 3)), spend("food", 900000, dhaka(2026, 10, 20)), spend("food", 294000, dhaka(2026, 11, 3))]));
    expect(find(facts, "sectorUp:food")?.compareMinor).toBe(213000);
  });

  it("a sector down on last month", () => {
    const facts = factsOf(input([...filler(), spend("transport", 160000, dhaka(2026, 10, 2)), spend("transport", 90000, dhaka(2026, 11, 2))]));
    expect(find(facts, "sectorDown:transport")).toMatchObject({
      kind: "sectorDown",
      headline: "Transport is down on last month",
      detail: "৳900 by 6 Nov, against ৳1,600 by this time in October",
    });
  });

  it("the largest sector when it is at least 30% of spending", () => {
    const month = [
      spend("groceries", 682000, dhaka(2026, 11, 2)),
      spend("food", 400000, dhaka(2026, 11, 2)),
      spend("transport", 400000, dhaka(2026, 11, 3)),
      spend("health", 300000, dhaka(2026, 11, 4)),
      spend("shopping", 82000, dhaka(2026, 11, 5)),
      spend("rent", 100, dhaka(2026, 10, 2)),
    ];
    expect(find(factsOf(input(month)), "topSector:groceries")).toMatchObject({
      amountMinor: 682000,
      compareMinor: 1864000,
      headline: "Groceries took 37% of spending",
      detail: "৳6,820 of ৳18,640 this month",
    });
  });

  it("the top sector's percent is the chart's own (largest remainder), not a separate rounding", () => {
    const month = [
      spend("groceries", 36495, dhaka(2026, 11, 2)),
      spend("food", 15876, dhaka(2026, 11, 2)),
      spend("food", 15876, dhaka(2026, 11, 3)),
      spend("transport", 15876, dhaka(2026, 11, 4)),
      spend("transport", 15877, dhaka(2026, 11, 5)),
      spend("rent", 100, dhaka(2026, 10, 2)),
    ];
    expect(find(factsOf(input(month)), "topSector:groceries")?.headline).toBe("Groceries took 37% of spending");
  });

  it("top sector at exactly 30% counts, just under does not", () => {
    const month = (groceries: number, transport: number) => [
      spend("groceries", groceries, dhaka(2026, 11, 2)),
      spend("food", 250000, dhaka(2026, 11, 2)),
      spend("transport", transport, dhaka(2026, 11, 3)),
      spend("health", 100000, dhaka(2026, 11, 4)),
      spend("shopping", 100000, dhaka(2026, 11, 5)),
      spend("rent", 100, dhaka(2026, 10, 2)),
    ];
    expect(find(factsOf(input(month(300000, 250000))), "topSector:groceries")).toBeDefined();
    const under = factsOf(input(month(299900, 250100)));
    expect(under.some((f) => f.kind === "topSector")).toBe(false);
  });

  it("spending ahead of income, only when something came in", () => {
    const month = [...filler(), spend("food", 1864000, dhaka(2026, 11, 2))];
    expect(find(factsOf(input(month, { income: [income(1200000)] })), "spentOverCameIn")).toMatchObject({
      amountMinor: 1864500,
      compareMinor: 1200000,
      headline: "Spending is ahead of income",
      detail: "৳18,645 spent, ৳12,000 came in so far this month",
    });
    expect(find(factsOf(input(month)), "spentOverCameIn")).toBeUndefined();
  });

  it("not sorted yet from ৳500", () => {
    const at = (minor: number) => find(factsOf(input([...filler(), spend("uncategorized", minor, dhaka(2026, 11, 2))])), "unsorted");
    expect(at(50000)).toMatchObject({ headline: "৳500 isn't sorted yet", detail: "Sorting it shows where it went" });
    expect(at(49999)).toBeUndefined();
  });

  it("not sorted yet is never an up, down or top fact", () => {
    const facts = factsOf(input([...filler(), spend("uncategorized", 100000, dhaka(2026, 10, 2)), spend("uncategorized", 900000, dhaka(2026, 11, 2))]));
    expect(facts.filter((f) => f.sector === "uncategorized")).toEqual([]);
  });

  it("unexplained cash never reads as spending", () => {
    const fact = find(factsOf(input(filler(), { unexplainedCashMinor: 500000 })), "unexplainedCash");
    expect(fact).toMatchObject({ amountMinor: 500000, headline: "৳5,000 cash isn't explained yet", detail: "Counting your cash keeps the picture right" });
    expect(`${fact?.headline ?? ""} ${fact?.detail ?? ""}`).not.toMatch(/spen[dt]|wasted|lost/i);
  });

  it("keeps at most 3, in the spec's priority", () => {
    const facts = factsOf(
      input(
        [
          ...filler(),
          spend("food", 213000, dhaka(2026, 10, 3)),
          spend("food", 294000, dhaka(2026, 11, 3)),
          spend("transport", 160000, dhaka(2026, 10, 2)),
          spend("transport", 90000, dhaka(2026, 11, 2)),
          spend("groceries", 700000, dhaka(2026, 11, 4)),
          spend("uncategorized", 250000, dhaka(2026, 11, 4)),
        ],
        { income: [income(100000)], unexplainedCashMinor: 500000 },
      ),
    );
    expect(facts.map((f) => f.id)).toEqual(["sectorUp:food", "spentOverCameIn", "unsorted"]);
  });

  it("the biggest rise wins; a tie goes to the sector list's order", () => {
    const biggest = factsOf(input([...filler(), spend("food", 213000, dhaka(2026, 10, 3)), spend("food", 294000, dhaka(2026, 11, 3)), spend("health", 100000, dhaka(2026, 10, 3)), spend("health", 300000, dhaka(2026, 11, 3))]));
    expect(biggest.filter((f) => f.kind === "sectorUp").map((f) => f.id)).toEqual(["sectorUp:health"]);
    const tie = factsOf(input([...filler(), spend("transport", 100000, dhaka(2026, 10, 3)), spend("transport", 200000, dhaka(2026, 11, 3)), spend("food", 100000, dhaka(2026, 10, 3)), spend("food", 200000, dhaka(2026, 11, 3))]));
    expect(tie.filter((f) => f.kind === "sectorUp").map((f) => f.id)).toEqual(["sectorUp:food"]);
  });

  it("needs 5 spends this month", () => {
    expect(tipFacts(input(filler(4))).status).toBe("notEnoughData");
    expect(tipFacts(input(filler(5))).status).toBe("ready");
  });

  it("needs two weeks since the first spend", () => {
    const recent = Array.from({ length: 5 }, (_, i) => spend("other", 100, NOW - (i + 1) * 3_600_000));
    expect(tipFacts(input([...recent, spend("other", 100, NOW - 13 * DAY_MS)])).status).toBe("notEnoughData");
    expect(tipFacts(input([...recent, spend("other", 100, NOW - 14 * DAY_MS)])).status).toBe("ready");
  });

  it("an empty month has not enough data", () => {
    expect(tipFacts(input([]))).toEqual({ status: "notEnoughData" });
  });

  it("a corrected spend counts once, at the replacement's amount", () => {
    const corrected = [
      spend("food", 300000, dhaka(2026, 11, 2), "t-orig"),
      refund("food", 300000, dhaka(2026, 11, 2), "t-orig:rev"),
      spend("food", 250000, dhaka(2026, 11, 2), "t-new"),
    ];
    expect(tipFacts(input([...filler(3), ...corrected])).status).toBe("notEnoughData");
    expect(find(factsOf(input([...filler(4), ...corrected])), "topSector:food")?.amountMinor).toBe(250000);
  });

  it("at month end, last month's comparison stops at its last day and this time of day", () => {
    const now = dhaka(2026, 3, 31, 15);
    const at = (febHour: number) =>
      factsOf({
        nowMs: now,
        expenses: [...filler(5, now), spend("health", 100000, dhaka(2026, 2, 10)), spend("health", 500000, dhaka(2026, 2, 28, febHour)), spend("health", 300000, dhaka(2026, 3, 20))],
        income: [],
        unexplainedCashMinor: 0,
      });
    expect(find(at(16), "sectorUp:health")?.compareMinor).toBe(100000);
    expect(find(at(14), "sectorDown:health")?.compareMinor).toBe(600000);
  });
});

describe("percentOf", () => {
  it("rounds half up on integers", () => {
    expect(percentOf(682000, 1864000)).toBe(37);
    expect(percentOf(1, 200)).toBe(1);
    expect(percentOf(1, 201)).toBe(0);
    expect(percentOf(5, 5)).toBe(100);
  });
});
