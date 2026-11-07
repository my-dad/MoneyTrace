import { describe, expect, it } from "vitest";
import { buildChatTimeline, chatOutcome, chatStatusCopy } from "./chat-view-model";

const event = (status: "posted" | "pending" | "deadLetter" | "rejected" | "received", extra: Record<string, unknown> = {}) => ({
  id: `event-${status}`, sourceType: "sms" as const, sourceHash: "hash", idempotencyKey: "key", status,
  stageAttempt: 0, claim: null, parkedStage: null, version: 1, receivedAtMs: 1, terminalAtMs: null,
  providerResultsPurged: false, retainedText: "Tk 500 debited", candidate: null, extraction: null,
  matchedTransactionId: null, matchKind: null, resolvedAccountId: null, resolvedDestinationAccountId: null,
  userConfirmed: false, ...extra,
});

describe("chat view model", () => {
  it("a posted event says Recorded, a pending one Waiting, a dead-lettered one Failed", () => {
    expect(chatOutcome(event("posted"))).toBe("recorded");
    expect(chatOutcome(event("pending"))).toBe("waiting");
    expect(chatOutcome(event("deadLetter"))).toBe("failed");
    expect(chatOutcome(event("received"))).toBe("reading");
  });

  it("uses plain copy for a not-financial rejection", () => {
    expect(chatStatusCopy(event("rejected", { extraction: { source: "deterministicParser", confidenceBp: 10000, notFinancialReason: "balanceOnly" } }))).toBe("Not an expense. Your total money stays the same.");
  });

  it("renders events and follow-ups in one timeline", () => {
    const items = buildChatTimeline({
      events: [event("posted")],
      followUps: [{ id: "follow-up", trigger: "withdrawalDestination", question: "Where did it go?", dueAtMs: 1, snoozedUntilMs: null, state: "open", createdAtMs: 1, resolvedAtMs: null }],
      accounts: [],
    });
    expect(items.map((item) => item.kind)).toEqual(["evidence", "followUp"]);
  });
});
