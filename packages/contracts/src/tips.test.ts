import { describe, expect, it } from "vitest";
import { OWNER_COLLECTIONS } from "./firestore/collections";
import { refreshTipsRequest, refreshTipsResponse } from "./commands/tips";
import { tipFactSchema, tipsReplySchema } from "./tips";

const fact = { id: "sectorUp:food", kind: "sectorUp", sector: "food", amountMinor: 294000, compareMinor: 213000, headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October" } as const;

const doc = {
  id: "current",
  month: "2026-11",
  status: "factsOnly",
  facts: [fact],
  advice: {},
  factsHash: "h",
  generatedAtMs: 1,
  aiDay: null,
  aiFactsHash: null,
  adviceAtMs: null,
  forcedDay: null,
  forcedToday: 0,
} as const;

describe("tips contracts", () => {
  it("a tips document parses", () => {
    expect(OWNER_COLLECTIONS.tips.safeParse(doc).success).toBe(true);
  });

  it("advice is at most 200 characters", () => {
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, advice: { [fact.id]: "a".repeat(200) } }).success).toBe(true);
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, advice: { [fact.id]: "a".repeat(201) } }).success).toBe(false);
  });

  it("holds at most 3 facts", () => {
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, facts: [fact, fact, fact] }).success).toBe(true);
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, facts: [fact, fact, fact, fact] }).success).toBe(false);
  });

  it("a not-enough-data document may say what it waits for", () => {
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, status: "notEnoughData", facts: [], waitingFor: "moreSpends" }).success).toBe(true);
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, status: "notEnoughData", facts: [], waitingFor: "soon" }).success).toBe(false);
  });

  it("the one document is `current`", () => {
    expect(OWNER_COLLECTIONS.tips.safeParse({ ...doc, id: "other" }).success).toBe(false);
  });

  it("a fact's amounts are whole minor units", () => {
    expect(tipFactSchema.safeParse({ ...fact, amountMinor: 12.5 }).success).toBe(false);
  });

  it("the AI reply shape is lenient on content, strict on shape", () => {
    expect(tipsReplySchema.safeParse({ tips: [{ factId: "unsorted", advice: "Has 5 digits" }] }).success).toBe(true);
    expect(tipsReplySchema.safeParse({ tips: "none" }).success).toBe(false);
  });

  it("refreshTips takes force and answers with an outcome", () => {
    expect(refreshTipsRequest.safeParse({ force: false }).success).toBe(true);
    expect(refreshTipsRequest.safeParse({ force: "yes" }).success).toBe(false);
    expect(refreshTipsResponse.safeParse({ outcome: "limitReached" }).success).toBe(true);
    expect(refreshTipsResponse.safeParse({ outcome: "done" }).success).toBe(false);
  });
});
