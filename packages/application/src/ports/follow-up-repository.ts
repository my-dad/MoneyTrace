import type { OwnerId } from "@moneytrace/domain";

/** Mirrors the `followUps` schema. */
export type FollowUpRecord = {
  id: string;
  trigger: "withdrawalDestination" | "unreviewedCashActivity" | "reconciliationDifference";
  targetTransactionId?: string;
  targetAccountId?: string;
  question: string;
  dueAtMs: number;
  snoozedUntilMs: number | null;
  state: "open" | "snoozed" | "resolved" | "dismissed";
  resolution?: string;
  createdAtMs: number;
  resolvedAtMs: number | null;
};

export type FollowUpRepository = {
  get(ownerId: OwnerId, id: string): Promise<FollowUpRecord | null>;
  listOpen(ownerId: OwnerId): Promise<FollowUpRecord[]>;
  resolve(
    ownerId: OwnerId,
    id: string,
    resolution: string,
    nowMs: number,
  ): Promise<"resolved" | "alreadyClosed">;
  snooze(ownerId: OwnerId, id: string, untilMs: number): Promise<"snoozed" | "alreadyClosed">;
  pushDue(ownerId: OwnerId, id: string, dueAtMs: number): Promise<void>;
  listDueToWake(nowMs: number, limit: number): Promise<{ ownerId: OwnerId; id: string }[]>;
  wake(ownerId: OwnerId, id: string, nowMs: number): Promise<"woken" | "notSnoozed">;
};
