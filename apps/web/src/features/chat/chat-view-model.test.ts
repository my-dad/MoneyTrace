import { describe, expect, it } from "vitest";
import { buildChatTimeline, chatOutcome, chatStatusCopy } from "./chat-view-model";

const event = (status: "posted" | "pending" | "deadLetter" | "rejected" | "received" | "linkedAsDuplicate" | "cancelled", extra: Record<string, unknown> = {}) => ({
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

  it("only a posted event says Recorded", () => {
    expect(chatStatusCopy(event("posted"))).toBe("Recorded · saved to your ledger");
    for (const status of ["pending", "deadLetter", "rejected", "received", "linkedAsDuplicate", "cancelled"] as const) {
      expect(chatOutcome(event(status))).not.toBe("recorded");
      expect(chatStatusCopy(event(status))).not.toMatch(/^Recorded/);
    }
  });

  it("a duplicate says it was already recorded and won't count twice", () => {
    expect(chatOutcome(event("linkedAsDuplicate"))).toBe("noChange");
    expect(chatStatusCopy(event("linkedAsDuplicate"))).toBe("Already recorded · not counted twice");
  });

  it("a rejected not-financial SMS explains that nothing was recorded", () => {
    const rejected = event("rejected", { extraction: { source: "deterministicParser", confidenceBp: 10000, notFinancialReason: "balanceOnly" } });
    expect(chatOutcome(rejected)).toBe("noChange");
    expect(chatStatusCopy(rejected)).toBe("Nothing recorded · this message didn't move any money");
  });

  it("the user's own Reject or Cancel isn't reported as a failure", () => {
    expect(chatOutcome(event("rejected"))).toBe("noChange");
    expect(chatStatusCopy(event("rejected"))).toBe("Rejected · nothing was saved");
    expect(chatOutcome(event("cancelled"))).toBe("noChange");
    expect(chatStatusCopy(event("cancelled"))).toBe("Cancelled · nothing was saved");
  });

  it("a real failure still says Failed", () => {
    expect(chatStatusCopy(event("deadLetter"))).toBe("Failed · nothing was saved");
  });

  it("renders events and follow-ups in one timeline", () => {
    const items = buildChatTimeline({
      events: [event("posted")],
      followUps: [{ id: "follow-up", trigger: "withdrawalDestination", question: "Where did it go?", dueAtMs: 1, snoozedUntilMs: null, state: "open", createdAtMs: 1, resolvedAtMs: null }],
      accounts: [],
      nowMs: 2,
    });
    expect(items.map((item) => item.kind)).toEqual(["evidence", "followUp"]);
  });
});
