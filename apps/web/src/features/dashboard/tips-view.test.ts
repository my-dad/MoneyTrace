import { describe, expect, it } from "vitest";
import type { TipsRow } from "../../shared/read-model-gateway";
import { tipsView } from "./tips-view";

const at = (iso: string) => Date.parse(`${iso}+06:00`);
const NOW = at("2026-11-06T20:00:00");

const doc: TipsRow = {
  id: "current",
  month: "2026-11",
  status: "ready",
  facts: [
    { id: "sectorUp:food", kind: "sectorUp", sector: "food", amountMinor: 294000, compareMinor: 213000, headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October" },
    { id: "unsorted", kind: "unsorted", amountMinor: 250000, headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" },
  ],
  advice: { "sectorUp:food": "A few more home-cooked dinners would bring it back in line." },
  factsHash: "h",
  generatedAtMs: NOW,
  aiDay: "2026-11-06",
  aiFactsHash: "h",
  adviceAtMs: at("2026-11-06T09:00:00"),
  forcedDay: null,
  forcedToday: 0,
};

describe("tipsView", () => {
  it("no document yet shows nothing", () => {
    expect(tipsView(null, NOW)).toEqual({ kind: "none" });
  });

  it("a document from another month is stale and not shown", () => {
    expect(tipsView({ ...doc, month: "2026-10" }, NOW)).toEqual({ kind: "none" });
  });

  it("not enough data", () => {
    expect(tipsView({ ...doc, status: "notEnoughData", facts: [] }, NOW)).toEqual({ kind: "notEnoughData" });
  });

  it("tips with their advice where there is some", () => {
    expect(tipsView(doc, NOW)).toEqual({
      kind: "tips",
      items: [
        { id: "sectorUp:food", kind: "sectorUp", sector: "food", headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October", advice: "A few more home-cooked dinners would bring it back in line." },
        { id: "unsorted", kind: "unsorted", headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" },
      ],
      age: "Made today",
      factsOnly: false,
    });
  });

  it("the age counts Dhaka days since the advice was made", () => {
    expect(tipsView({ ...doc, adviceAtMs: at("2026-11-05T23:30:00") }, NOW)).toMatchObject({ age: "Made 1 day ago" });
    expect(tipsView({ ...doc, adviceAtMs: at("2026-11-04T08:00:00") }, NOW)).toMatchObject({ age: "Made 2 days ago" });
    expect(tipsView({ ...doc, adviceAtMs: null, status: "factsOnly", advice: {} }, NOW)).toMatchObject({ age: null, factsOnly: true });
  });

  it("a month with nothing notable", () => {
    expect(tipsView({ ...doc, facts: [], advice: {} }, NOW)).toMatchObject({ kind: "tips", items: [] });
  });
});
