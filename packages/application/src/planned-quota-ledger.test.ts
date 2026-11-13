import { asOwnerId } from "@moneytrace/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock, SequentialIdGenerator } from "./testing/fakes";
import { InMemoryQuota } from "./testing/in-memory-quota";
import { GLOBAL_QUOTA_OWNER, MEMBER_QUOTA_LIMITS, OWNER_QUOTA_LIMITS, PlannedQuotaLedger } from "./planned-quota-ledger";
import { DEFAULT_QUOTA_LIMITS, type QuotaLedger } from "./ports/quota-ledger";

const mabrur = asOwnerId("mabrur");
const friend = asOwnerId("friend");
const T = Date.UTC(2026, 10, 13, 10);
const EST = 5_000;

let inner: InMemoryQuota;
/** Used through the port, as the executor does: callers still pass their own limits. */
let ledger: QuotaLedger;
beforeEach(() => {
  const clock = new FakeClock();
  inner = new InMemoryQuota(clock, new SequentialIdGenerator());
  ledger = new PlannedQuotaLedger({
    inner,
    planOf: (o) => Promise.resolve(o === mabrur ? "owner" : "member"),
    globalMonthlyMicroUsd: 10_000_000,
  });
});

const spend = async (owner: typeof mabrur, n: number) => {
  let last;
  for (let i = 0; i < n; i++) last = await ledger.reserve(owner, EST, T, DEFAULT_QUOTA_LIMITS);
  return last;
};

describe("PlannedQuotaLedger (CR-009)", () => {
  it("plans: the owner keeps USD 5/month and 0.50/day; everyone else gets USD 1/month and 0.20/day", () => {
    expect(OWNER_QUOTA_LIMITS).toEqual({ perRequestMicroUsd: 50_000, dailyMicroUsd: 500_000, monthlyMicroUsd: 5_000_000 });
    expect(MEMBER_QUOTA_LIMITS).toEqual({ perRequestMicroUsd: 50_000, dailyMicroUsd: 200_000, monthlyMicroUsd: 1_000_000 });
  });

  it("a member stops at USD 0.20 a day whatever limits the caller passes", async () => {
    expect((await spend(friend, 40))?.status).toBe("reserved");
    expect(await ledger.reserve(friend, EST, T, DEFAULT_QUOTA_LIMITS)).toEqual({ status: "exhausted", window: "daily" });
    expect(await ledger.availableMicroUsd(friend, T, DEFAULT_QUOTA_LIMITS)).toBe(0);
    // The owner's own budget is untouched.
    expect((await ledger.reserve(mabrur, EST, T, DEFAULT_QUOTA_LIMITS)).status).toBe("reserved");
  });

  it("everyone stops at the global monthly cap, and a refused user reservation is released from it", async () => {
    const tight: QuotaLedger = new PlannedQuotaLedger({ inner, planOf: () => Promise.resolve("member"), globalMonthlyMicroUsd: 3 * EST });
    expect((await tight.reserve(friend, EST, T, DEFAULT_QUOTA_LIMITS)).status).toBe("reserved");
    expect((await tight.reserve(friend, EST, T, DEFAULT_QUOTA_LIMITS)).status).toBe("reserved");
    expect((await tight.reserve(mabrur, EST, T, DEFAULT_QUOTA_LIMITS)).status).toBe("reserved");
    expect(await tight.reserve(mabrur, EST, T, DEFAULT_QUOTA_LIMITS)).toEqual({ status: "exhausted", window: "monthly" });
    expect(await tight.availableMicroUsd(mabrur, T, DEFAULT_QUOTA_LIMITS)).toBe(0);
  });

  it("a user refusal hands back its share of the global cap", async () => {
    await spend(friend, 40);
    const before = await inner.availableMicroUsd(GLOBAL_QUOTA_OWNER, T, { perRequestMicroUsd: 50_000, dailyMicroUsd: 10_000_000, monthlyMicroUsd: 10_000_000 });
    expect((await ledger.reserve(friend, EST, T, DEFAULT_QUOTA_LIMITS)).status).toBe("exhausted");
    const after = await inner.availableMicroUsd(GLOBAL_QUOTA_OWNER, T, { perRequestMicroUsd: 50_000, dailyMicroUsd: 10_000_000, monthlyMicroUsd: 10_000_000 });
    expect(after).toBe(before);
  });

  it("settling moves both the user's and the global counters", async () => {
    const r = await ledger.reserve(friend, EST, T, DEFAULT_QUOTA_LIMITS);
    if (r.status !== "reserved") throw new Error("setup");
    await ledger.settle(friend, r.reservationId, 2 * EST, DEFAULT_QUOTA_LIMITS);
    expect(await ledger.availableMicroUsd(friend, T, DEFAULT_QUOTA_LIMITS)).toBe(200_000 - 2 * EST);
    const global = await inner.availableMicroUsd(GLOBAL_QUOTA_OWNER, T, { perRequestMicroUsd: 50_000, dailyMicroUsd: 10_000_000, monthlyMicroUsd: 10_000_000 });
    expect(global).toBe(10_000_000 - 2 * EST);
  });
});
