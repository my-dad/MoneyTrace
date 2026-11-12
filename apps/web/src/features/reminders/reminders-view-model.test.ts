import { describe, expect, it } from "vitest";
import type { FollowUpRow } from "../../shared/read-model-gateway";
import { clockLabel, snoozeOptions, splitReminders, whenLabel } from "./reminders-view-model";

const at = (iso: string) => Date.parse(`${iso}+06:00`);
const row = (id: string, patch: Partial<FollowUpRow>): FollowUpRow => ({
  id,
  trigger: "withdrawalDestination",
  question: "Where did it go?",
  dueAtMs: at("2026-11-06T21:00:00"),
  snoozedUntilMs: null,
  state: "open",
  createdAtMs: at("2026-11-05T19:00:00"),
  resolvedAtMs: null,
  ...patch,
});
const NOW = at("2026-11-07T10:00:00");

describe("splitReminders", () => {
  it("separates open and snoozed", () => {
    const result = splitReminders(
      [
        row("late", { dueAtMs: at("2026-11-08T21:00:00") }),
        row("sleep", { state: "snoozed", snoozedUntilMs: at("2026-12-01T09:00:00") }),
        row("early", { dueAtMs: at("2026-11-06T21:00:00") }),
      ],
      NOW,
    );
    expect(result.open.map((r) => r.id)).toEqual(["early", "late"]);
    expect(result.snoozed.map((r) => r.id)).toEqual(["sleep"]);
  });

  it("treats an expired snooze as open", () => {
    const result = splitReminders([row("woke", { state: "snoozed", snoozedUntilMs: at("2026-11-07T09:00:00") })], NOW);
    expect(result.open.map((r) => r.id)).toEqual(["woke"]);
    expect(result.snoozed).toEqual([]);
  });

  it("drops resolved and dismissed", () => {
    const result = splitReminders([row("a", { state: "resolved" }), row("b", { state: "dismissed" })], NOW);
    expect(result).toEqual({ open: [], snoozed: [] });
  });
});

describe("snoozeOptions", () => {
  it("offers an hour, tonight at 9 pm and tomorrow at 9 am in Dhaka time", () => {
    const options = snoozeOptions(NOW);
    expect(options.map((o) => o.choice)).toEqual(["hour", "tonight", "tomorrow"]);
    expect(options.map((o) => whenLabel(o.untilMs))).toEqual(["7 Nov, 11:00 am", "7 Nov, 9:00 pm", "8 Nov, 9:00 am"]);
  });

  it("drops tonight once it is less than an hour away", () => {
    const options = snoozeOptions(at("2026-11-07T20:30:00"));
    expect(options.map((o) => o.choice)).toEqual(["hour", "tomorrow"]);
    expect(clockLabel(options[1]?.untilMs ?? 0)).toBe("9:00 am");
  });
});
