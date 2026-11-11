import { describe, expect, it } from "vitest";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import type { SourceEventRow } from "../../shared/read-model-gateway";
import { filterActivity, findOriginal, toActivityItems } from "./activity-view-model";

const items = toActivityItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS);
const byId = (id: string) => {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`missing ${id}`);
  return item;
};
const [base] = FIXTURE_SOURCE_EVENTS;
if (base === undefined) throw new Error("no fixture events");
const event = (patch: Partial<SourceEventRow>): SourceEventRow => ({ ...base, ...patch });

describe("toActivityItems", () => {
  it("maps each source status to the right label", () => {
    expect(byId("se-amex-shwapno")).toMatchObject({ tone: "verified", badge: "Verified", statusText: "Recorded · saved to your ledger" });
    expect(byId("se-pending-agora")).toMatchObject({ tone: "needsAnswer", badge: "Needs answer" });
    expect(byId("se-dup-shwapno")).toMatchObject({ tone: "neutral", badge: "Not counted twice", statusText: "Already recorded · not counted twice", duplicate: true });
    expect(byId("se-rejected")).toMatchObject({ tone: "neutral", badge: "Rejected", statusText: "Rejected · nothing was saved" });
    expect(byId("se-dead")).toMatchObject({ tone: "failed", badge: "Failed", statusText: "Failed · nothing was saved" });
    const quota = toActivityItems([event({ status: "pending", pendingReason: "aiQuotaExhausted" })], [])[0];
    expect(quota).toMatchObject({ tone: "pending", badge: "Pending", statusText: "Waiting for your answer · AI budget reached" });
    const reading = toActivityItems([event({ status: "interpreted" })], [])[0];
    expect(reading).toMatchObject({ tone: "pending", badge: "Pending" });
  });

  it("only a posted item says Recorded", () => {
    const recorded = items.filter((item) => item.statusText.startsWith("Recorded"));
    expect(recorded.every((item) => item.badge === "Verified")).toBe(true);
    expect(items.filter((item) => item.badge === "Verified").length).toBe(7);
  });

  it("shows a withdrawal as a move, not spending", () => {
    expect(byId("se-atm")).toMatchObject({
      direction: "move",
      title: "Transfer: Bank → Cash",
      accountName: "DBBL Savings",
      destinationName: "Cash · place not set",
      amountMinor: 500_000,
    });
    expect(byId("se-salary").direction).toBe("in");
    expect(byId("se-amex-shwapno").direction).toBe("out");
  });

  it("sorts newest first", () => {
    const times = items.map((item) => item.occurredAtMs);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("derives the posted transaction id the way the post stage does", () => {
    expect(byId("se-amex-shwapno").transactionId).toBe("txn-se-amex-shwapno");
    expect(byId("se-pending-agora").transactionId).toBeNull();
    const finalized = toActivityItems([event({ status: "posted", matchKind: "finalizesAuthorization", matchedTransactionId: "txn-auth" })], [])[0];
    expect(finalized?.transactionId).toBe("txn-auth");
  });

  it("names how the evidence was read", () => {
    expect(byId("se-amex-shwapno").provenance).toBe("Read by the city-sms parser (v1)");
    expect(byId("se-dup-shwapno").provenance).toBe("Read by AI (deepseek-flash, prompt interpret-v1)");
    expect(byId("se-dead").provenance).toBeNull();
  });
});

describe("filterActivity", () => {
  it("filters needs-answer to awaitingClarification only", () => {
    expect(filterActivity(items, "needsAnswer").map((item) => item.id).sort()).toEqual(["se-pending-agora", "se-pending-ammu"]);
  });

  it("filters posted, duplicates and all", () => {
    expect(filterActivity(items, "posted")).toHaveLength(7);
    expect(filterActivity(items, "duplicates").map((item) => item.id)).toEqual(["se-dup-shwapno"]);
    expect(filterActivity(items, "all")).toHaveLength(items.length);
  });
});

describe("findOriginal", () => {
  it("links a duplicate to its original", () => {
    expect(findOriginal(items, byId("se-dup-shwapno"))?.id).toBe("se-amex-shwapno");
    expect(findOriginal(items, byId("se-atm"))).toBeNull();
  });
});
