/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Commands } from "../../shared/commands";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { ReminderSettingsForm } from "./ReminderSettingsForm";

afterEach(cleanup);

const INITIAL = { frequency: "daily" as const, digestLocalTime: "21:00", minThresholdMinor: 50_000, quietHours: { startLocalTime: "23:00", endLocalTime: "07:00" } };

describe("ReminderSettingsForm", () => {
  it("saving with fixture commands shows the demo-unavailable status", async () => {
    render(<ReminderSettingsForm initial={INITIAL} updateSettings={createFixtureCommands().updateSettings} />);
    fireEvent.click(screen.getByRole("button", { name: "Save reminders" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("sends the chosen reminders", () => {
    const updateSettings = vi.fn<Commands["updateSettings"]>(() => new Promise(() => undefined));
    render(<ReminderSettingsForm initial={INITIAL} updateSettings={updateSettings} />);
    fireEvent.click(screen.getByRole("radio", { name: "Weekly digest" }));
    fireEvent.change(screen.getByLabelText("Only ask about amounts from"), { target: { value: "1,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reminders" }));
    expect(updateSettings).toHaveBeenCalledWith({
      reminders: { frequency: "weekly", digestLocalTime: "21:00", minThresholdMinor: 100_000, quietHours: { startLocalTime: "23:00", endLocalTime: "07:00" } },
    });
  });

  it("rejects a minimum amount that isn't a number", () => {
    const updateSettings = vi.fn<Commands["updateSettings"]>();
    render(<ReminderSettingsForm initial={INITIAL} updateSettings={updateSettings} />);
    fireEvent.change(screen.getByLabelText("Only ask about amounts from"), { target: { value: "some" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reminders" }));
    expect(screen.getByText("Enter an amount in taka, like 500.")).toBeTruthy();
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
