/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { FIXTURE_FOLLOW_UPS, FIXTURE_NOW_MS } from "../../shared/fixtures/household";
import { ChatLauncher, openQuestionCount, useChatOpener } from "./ChatLauncher";

function CountButton() {
  const opener = useChatOpener();
  return opener === null ? null : (
    <button type="button" onClick={() => { opener.openChat("cashCount"); }}>
      Count from the page
    </button>
  );
}

afterEach(cleanup);

const open = () =>
  render(
    <main>
      <button type="button">Dashboard control</button>
      <ChatLauncher gateway={createFixtureReadModels()} commands={createFixtureCommands()} nowMs={FIXTURE_NOW_MS} />
    </main>,
  );

describe("ChatLauncher", () => {
  it("lets the page open the chat straight on the cash count", () => {
    render(
      <ChatLauncher gateway={createFixtureReadModels()} commands={createFixtureCommands()} nowMs={FIXTURE_NOW_MS}>
        <CountButton />
      </ChatLauncher>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Count from the page" }));
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    expect(within(dialog).getByText("How much cash do you have right now?")).toBeTruthy();
  });

  it("outside a launcher there is no opener", () => {
    render(<CountButton />);
    expect(screen.queryByRole("button", { name: "Count from the page" })).toBeNull();
  });

  it("opens, traps focus, closes on Escape and returns focus", () => {
    open();
    const button = screen.getByRole("button", { name: /Open chat/ });
    button.focus();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Open chat/ }));
  });

  it("closes with the close button", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Open chat/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("badge counts open and expired-snooze questions", () => {
    expect(openQuestionCount(FIXTURE_FOLLOW_UPS, FIXTURE_NOW_MS)).toBe(2);
    expect(openQuestionCount(FIXTURE_FOLLOW_UPS, Date.parse("2026-12-02T00:00:00+06:00"))).toBe(3);
    open();
    expect(screen.getByRole("button", { name: "Open chat, 2 questions waiting" })).toBeTruthy();
  });

  it("sending in the demo shows the demo status inside the panel", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Open chat/ }));
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    const composer = within(dialog).getByLabelText<HTMLTextAreaElement>("Message MoneyTrace");
    fireEvent.change(composer, { target: { value: "paid 500 for rickshaw" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("the panel adds no second main landmark", () => {
    const { container } = open();
    fireEvent.click(screen.getByRole("button", { name: /Open chat/ }));
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("has no axe violations when open", async () => {
    const { container } = open();
    fireEvent.click(screen.getByRole("button", { name: /Open chat/ }));
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("shows the question the badge counts, including one whose snooze has passed", () => {
    const later = Date.parse("2026-12-02T00:00:00+06:00");
    render(<ChatLauncher gateway={createFixtureReadModels()} commands={createFixtureCommands()} nowMs={later} />);
    fireEvent.click(screen.getByRole("button", { name: "Open chat, 3 questions waiting" }));
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    expect(within(dialog).getByText(/Home cash counted ৳300 less than expected/)).toBeTruthy();
  });

  it("keeps the chat open when Escape ends a Bangla (IME) composition", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Open chat/ }));
    const dialog = screen.getByRole("dialog", { name: "Chat" });
    fireEvent.keyDown(within(dialog).getByLabelText("Message MoneyTrace"), { key: "Escape", isComposing: true });
    expect(screen.getByRole("dialog", { name: "Chat" })).toBeTruthy();
  });
});
