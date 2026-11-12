import { describe, expect, it } from "vitest";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import type { SourceEventRow } from "../../shared/read-model-gateway";
import { toRecentItems } from "./recent-items";

const base = FIXTURE_SOURCE_EVENTS.find((e) => e.id === "se-atm") as SourceEventRow;
const withStatus = (id: string, patch: Partial<SourceEventRow>, receivedAtMs: number): SourceEventRow => ({ ...base, id, receivedAtMs, ...patch });

describe("toRecentItems", () => {
  it("maps each event status to its label", () => {
    const events = [
      withStatus("a", { status: "posted" }, 9),
      withStatus("b", { status: "pending", pendingReason: "awaitingClarification" }, 8),
      withStatus("c", { status: "pending", pendingReason: "aiQuotaExhausted" }, 7),
      withStatus("d", { status: "received" }, 6),
      withStatus("e", { status: "deadLetter", deadLetterReason: "stageFailed" }, 5),
      withStatus("f", { status: "rejected" }, 4),
      withStatus("g", { status: "cancelled" }, 3),
      withStatus("h", { status: "linkedAsDuplicate" }, 2),
    ].map((e) => ({ ...e, candidate: null }));
    expect(toRecentItems(events, FIXTURE_ACCOUNTS, 10).map((i) => [i.id, i.status, i.statusLabel])).toEqual([
      ["a", "recorded", "Recorded"],
      ["b", "waiting", "Waiting for your answer"],
      ["c", "inProgress", "In progress"],
      ["d", "inProgress", "In progress"],
      ["e", "failed", "Couldn't read"],
      ["f", "notCounted", "Not counted"],
      ["g", "notCounted", "Not counted"],
      ["h", "notCounted", "Not counted"],
    ]);
  });

  it("says Recorded only for posted events", () => {
    const items = toRecentItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS, 50);
    const posted = new Set(FIXTURE_SOURCE_EVENTS.filter((e) => e.status === "posted").map((e) => e.id));
    expect(items.filter((i) => i.statusLabel === "Recorded").every((i) => posted.has(i.id))).toBe(true);
    expect(items.some((i) => i.statusLabel === "Recorded")).toBe(true);
  });

  it("keeps at most limit items, newest first", () => {
    const items = toRecentItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS, 3);
    expect(items).toHaveLength(3);
    const times = items.map((i) => i.atMs);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("a withdrawal reads as a move from bank to cash, not spending", () => {
    const atm = toRecentItems([base], FIXTURE_ACCOUNTS, 1)[0];
    expect(atm?.title).toBe("Bank → Cash");
    expect(atm?.detail).toMatch(/ATM withdrawal · \w{3} 5 Nov/);
  });
});
