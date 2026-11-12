import type { FollowUpRow } from "../../shared/read-model-gateway";

/** Open questions by due time; snoozed ones apart until their snooze ends. Closed rows are left out. */
export function splitReminders(rows: FollowUpRow[], nowMs: number): { open: FollowUpRow[]; snoozed: FollowUpRow[] } {
  const open: FollowUpRow[] = [];
  const snoozed: FollowUpRow[] = [];
  for (const row of rows) {
    if (row.state === "resolved" || row.state === "dismissed") continue;
    const sleeping = row.state === "snoozed" && row.snoozedUntilMs !== null && row.snoozedUntilMs > nowMs;
    (sleeping ? snoozed : open).push(row);
  }
  const byDue = (a: FollowUpRow, b: FollowUpRow) => a.dueAtMs - b.dueAtMs;
  return { open: open.sort(byDue), snoozed: snoozed.sort((a, b) => (a.snoozedUntilMs ?? 0) - (b.snoozedUntilMs ?? 0)) };
}

const ZONE = "Asia/Dhaka";
const HOUR_MS = 3_600_000;
// Dhaka has no daylight saving: always UTC+6.
const DHAKA_OFFSET_MS = 6 * HOUR_MS;

const whenFormat = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, day: "numeric", month: "short" });
const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true });

/** "6 Nov, 9:00 pm" */
export const whenLabel = (ms: number): string => whenFormat.format(ms).replace(" at ", ", ");
/** "5 Nov" */
export const dayLabel = (ms: number): string => dayFormat.format(ms);
/** "9:00 pm" */
export const clockLabel = (ms: number): string => clockFormat.format(ms);

export type SnoozeChoice = "hour" | "tonight" | "tomorrow";

/** The snooze times offered at nowMs. "Tonight" is offered only before 8 pm. */
export function snoozeOptions(nowMs: number): { choice: SnoozeChoice; untilMs: number }[] {
  const dayStart = Math.floor((nowMs + DHAKA_OFFSET_MS) / (24 * HOUR_MS)) * 24 * HOUR_MS - DHAKA_OFFSET_MS;
  const tonight = dayStart + 21 * HOUR_MS;
  const options: { choice: SnoozeChoice; untilMs: number }[] = [{ choice: "hour", untilMs: nowMs + HOUR_MS }];
  if (tonight - nowMs > HOUR_MS) options.push({ choice: "tonight", untilMs: tonight });
  options.push({ choice: "tomorrow", untilMs: dayStart + 33 * HOUR_MS });
  return options;
}
