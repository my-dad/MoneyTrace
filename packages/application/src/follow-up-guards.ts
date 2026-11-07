import type { FollowUpRecord } from "./ports/follow-up-repository";

const isClosed = (f: FollowUpRecord): boolean => f.state === "resolved" || f.state === "dismissed";

export function decideResolve(
  f: FollowUpRecord,
  resolution: string,
  nowMs: number,
): FollowUpRecord | null {
  if (isClosed(f)) return null;
  return { ...f, state: "resolved", resolution, resolvedAtMs: nowMs, snoozedUntilMs: null };
}

export function decideSnooze(f: FollowUpRecord, untilMs: number): FollowUpRecord | null {
  return isClosed(f) ? null : { ...f, state: "snoozed", snoozedUntilMs: untilMs };
}

export function decideWake(f: FollowUpRecord, nowMs: number): FollowUpRecord | null {
  if (f.state !== "snoozed" || f.snoozedUntilMs === null || f.snoozedUntilMs > nowMs) return null;
  return { ...f, state: "open", snoozedUntilMs: null, dueAtMs: nowMs };
}
