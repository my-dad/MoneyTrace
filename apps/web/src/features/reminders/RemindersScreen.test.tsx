/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { FIXTURE_FOLLOW_UPS } from "../../shared/fixtures/household";
import type { FollowUpRow, ReadModelGateway } from "../../shared/read-model-gateway";
import { RemindersScreen } from "./RemindersScreen";

afterEach(cleanup);

const NOW = Date.parse("2026-11-07T10:00:00+06:00");
type Gateway = Pick<ReadModelGateway, "watchFollowUps">;
const gatewayOf = (rows: FollowUpRow[]): Gateway => ({ watchFollowUps: (onValue) => { onValue(rows); return () => undefined; } });
const demoCommands = { snoozeFollowUp: () => Promise.reject(new DemoUnavailableError()) };

const renderScreen = (gateway: Gateway = gatewayOf(FIXTURE_FOLLOW_UPS)) =>
  render(<RemindersScreen gateway={gateway} commands={demoCommands} nowMs={NOW} />);

describe("RemindersScreen", () => {
  it("shows the open and snoozed sections", () => {
    renderScreen();
    const open = screen.getByRole("region", { name: /To answer/ });
    expect(within(open).getAllByRole("listitem")).toHaveLength(2);
    expect(within(open).getByText("Where did the ৳5,000 from yesterday's ATM withdrawal go?")).toBeTruthy();
    expect(within(open).getByText("Asked 5 Nov · due 6 Nov, 9:00 pm")).toBeTruthy();
    const snoozed = screen.getByRole("region", { name: /Snoozed/ });
    expect(within(snoozed).getByText("Snoozed until 1 Dec, 9:00 am")).toBeTruthy();
    expect(within(snoozed).getByRole("link", { name: "Answer now" })).toBeTruthy();
  });

  it('never uses the word "spent" for withdrawal destination', () => {
    renderScreen(gatewayOf(FIXTURE_FOLLOW_UPS.filter((row) => row.trigger === "withdrawalDestination")));
    const item = screen.getByRole("listitem");
    expect(item.textContent).not.toMatch(/\bspent\b/i);
    expect(item.textContent).toContain("cash with no place yet, not spending");
  });

  it("Answer opens chat", () => {
    renderScreen();
    const links = screen.getAllByRole("link", { name: "Answer" });
    expect(links[0]?.getAttribute("href")).toBe("/chat?followUp=fu-atm");
  });

  it("snoozing with fixture commands shows the demo-unavailable status", async () => {
    renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "Snooze" })[0] as HTMLElement);
    const dialog = screen.getByRole("dialog", { name: "Ask again…" });
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "In 1 hour11:00 am",
      "Tonight9:00 pm",
      "Tomorrow morning8 Nov, 9:00 am",
      "Cancel",
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: /Tonight/ }));
    expect((await within(dialog).findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Done asks to confirm and says it changes no money", async () => {
    renderScreen();
    fireEvent.click(screen.getAllByRole("button", { name: "Done" })[1] as HTMLElement);
    const dialog = screen.getByRole("dialog", { name: "Mark as done?" });
    expect(dialog.textContent).toContain("without changing any money");
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark as done" }));
    expect((await within(dialog).findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("shows the empty state", () => {
    renderScreen(gatewayOf([{ ...FIXTURE_FOLLOW_UPS[0] as FollowUpRow, state: "resolved" }]));
    expect(screen.getByText("Nothing to answer")).toBeTruthy();
  });

  it("shows loading before the first snapshot", () => {
    renderScreen({ watchFollowUps: () => () => undefined });
    expect(screen.getByRole("status").textContent).toBe("Loading your reminders…");
    expect(screen.queryByText("Nothing to answer")).toBeNull();
  });

  it("shows the error state and retries", () => {
    let fail = true;
    renderScreen({
      watchFollowUps: (onValue, onError) => {
        if (fail) onError?.(new Error("down"));
        else onValue(FIXTURE_FOLLOW_UPS);
        return () => undefined;
      },
    });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your reminders");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByRole("region", { name: /To answer/ })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = renderScreen();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
