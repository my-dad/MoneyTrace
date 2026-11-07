import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createProviderWorld } from "../testing/fake-provider";
import { ResumeQuotaBlockedEvents } from "./resume-quota-blocked-events";

const alice = asOwnerId("alice");
const bob = asOwnerId("bob");
const limits = { perRequestMicroUsd: 50, dailyMicroUsd: 100, monthlyMicroUsd: 1000 };
const DAY = 86_400_000;

let w: ReturnType<typeof createProviderWorld>;
let resume: ResumeQuotaBlockedEvents;

async function park(
  id: string,
  reason: "aiQuotaExhausted" | "providerOutcomeUnknown",
  owner = alice,
) {
  const sourceEventId = asSourceEventId(id);
  await w.sourceEvents.create(owner, {
    sourceEventId,
    sourceType: "chat",
    sourceHash: `h-${id}`,
    idempotencyKey: `k-${id}`,
    receivedAtMs: w.clock.nowMs(),
  });
  const c = await w.sourceEvents.claim(owner, sourceEventId, "normalize", "w", w.clock.nowMs());
  if (c.status !== "claimed") throw new Error("not claimed");
  await w.sourceEvents.commitStage(owner, c.claim, {
    nextStatus: "pending",
    pendingReason: reason,
    outputs: [],
  });
  w.clock.advance(1);
}

const statusOf = async (id: string, owner = alice) =>
  (await w.sourceEvents.get(owner, asSourceEventId(id)))?.status;

beforeEach(() => {
  w = createProviderWorld();
  resume = new ResumeQuotaBlockedEvents({
    sourceEvents: w.sourceEvents,
    quota: w.quota,
    clock: w.clock,
    limits,
    estimateMicroUsd: 50,
  });
});

describe("ResumeQuotaBlockedEvents", () => {
  it("reopens blocked events once quota is available, oldest first, within what remains", async () => {
    await park("a", "aiQuotaExhausted");
    await park("b", "aiQuotaExhausted");
    await park("c", "aiQuotaExhausted");
    expect(await resume.execute(w.clock.nowMs(), 10)).toEqual({ reopened: 2 });
    expect(await statusOf("a")).toBe("received");
    expect(await statusOf("b")).toBe("received");
    expect(await statusOf("c")).toBe("pending");
  });

  it("leaves them parked while the window is exhausted, then resumes when it rolls", async () => {
    await w.quota.reserve(alice, 50, w.clock.nowMs(), limits);
    await w.quota.reserve(alice, 50, w.clock.nowMs(), limits);
    await park("a", "aiQuotaExhausted");
    expect(await resume.execute(w.clock.nowMs(), 10)).toEqual({ reopened: 0 });
    expect(await statusOf("a")).toBe("pending");
    w.clock.advance(DAY);
    expect(await resume.execute(w.clock.nowMs(), 10)).toEqual({ reopened: 1 });
    expect(await statusOf("a")).toBe("received");
  });

  it("one owner's exhausted quota does not hold back another's", async () => {
    await w.quota.reserve(alice, 50, w.clock.nowMs(), limits);
    await w.quota.reserve(alice, 50, w.clock.nowMs(), limits);
    await park("a", "aiQuotaExhausted");
    await park("b", "aiQuotaExhausted", bob);
    expect(await resume.execute(w.clock.nowMs(), 10)).toEqual({ reopened: 1 });
    expect(await statusOf("b", bob)).toBe("received");
  });

  it("never touches an unknown provider outcome, which needs the user", async () => {
    await park("a", "providerOutcomeUnknown");
    expect(await resume.execute(w.clock.nowMs(), 10)).toEqual({ reopened: 0 });
    expect(await statusOf("a")).toBe("pending");
  });
});
