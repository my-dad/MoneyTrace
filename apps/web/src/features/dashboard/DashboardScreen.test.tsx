/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { FIXTURE_NOW_MS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";

const createFixtureEvents = () => [...FIXTURE_SOURCE_EVENTS];
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { ReadModelGateway } from "../../shared/read-model-gateway";
import { DashboardScreen } from "./DashboardScreen";
import { ChatOpenerContext } from "../chat/ChatLauncher";

afterEach(cleanup);

const open = (gateway: ReadModelGateway = createFixtureReadModels(), onSignOut = vi.fn(() => Promise.resolve())) =>
  render(<DashboardScreen gateway={gateway} nowMs={FIXTURE_NOW_MS} displayName="Demo" onSignOut={onSignOut} />);

const figure = (name: string) => screen.getByRole("group", { name }).textContent;

const silent: ReadModelGateway = {
  watchAccounts: () => () => undefined,
  watchBalances: () => () => undefined,
  watchFollowUps: () => () => undefined,
  watchSourceEvents: () => () => undefined,
  watchExpenseEntries: () => () => undefined,
  watchIncomeEntries: () => () => undefined,
  watchAiUsage: () => () => undefined,
  watchSourceEntries: () => () => undefined,
};

describe("DashboardScreen", () => {
  it("shows this month's figures", () => {
    open();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(figure("Spent")).toContain("৳18,640");
    expect(figure("Came in")).toContain("৳85,000");
    const note = screen.getByRole("note", { name: "Cash not yet explained" });
    expect(note.textContent).toContain("৳5,000");
    expect(note.textContent).toContain("not counted as spending");
    expect(screen.getByText("৳1,740 more than this time last month")).toBeTruthy();
    expect(figure("Net money")).toContain("৳1,25,630");
  });

  it("lists each source with its money in and out this month (CR-008)", () => {
    open();
    const sources = screen.getByRole("region", { name: "Net money" });
    expect(within(sources).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "DBBL Savingsin ৳85,000 · out ৳15,000",
      "City Bank Amexin ৳0 · out ৳2,150",
      "bKashin ৳10,000 · out ৳950",
      "Walletin ৳0 · out ৳650",
    ]);
  });

  it("shows source chips on recent rows, and Transfer with both sources", () => {
    open();
    const recent = screen.getByRole("region", { name: "Recent" });
    const transfer = within(recent).getAllByRole("listitem").find((li) => li.textContent.startsWith("Transfer"));
    expect(transfer?.textContent).toContain("TransferDBBL SavingsbKash");
  });

  it("steps to October and back", () => {
    open();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next month" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(figure("Spent")).toContain("৳52,300");
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(figure("Spent")).toContain("৳18,640");
  });

  it("charts categories largest first", () => {
    open();
    const chart = screen.getByRole("region", { name: "Where it went" });
    expect(within(chart).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Groceries৳6,820",
      "Other৳5,730",
      "Transport৳3,150",
      "Eating out৳2,940",
    ]);
  });

  it("shows Loading and never ৳0 before the first snapshot", () => {
    open(silent);
    expect(screen.getAllByRole("status")[0]?.textContent).toBe("Loading…");
    expect(screen.queryByText(/৳/)).toBeNull();
    expect(screen.queryByText(/to get started/)).toBeNull();
  });

  it("shows the new-user message when nothing is recorded", () => {
    open(new InMemoryReadModelGateway());
    expect(screen.getByText("Paste a bank SMS or tell me about a purchase to get started.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Spent" })).toBeNull();
  });

  it("shows the read-failure bar and keeps loaded figures", () => {
    const gateway = createFixtureReadModels();
    open(gateway);
    act(() => { gateway.fail("balances"); });
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load your latest figures. Anything shown may be out of date.");
    expect(figure("Spent")).toContain("৳18,640");
  });

  it("a month with nothing recorded says so", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("Nothing recorded in September 2026")).toBeTruthy();
  });

  it("recent shows statuses", () => {
    open();
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(within(recent).getAllByText("Recorded").length).toBeGreaterThan(0);
    expect(within(recent).getAllByText("Waiting for your answer").length).toBeGreaterThan(0);
  });

  it("menu shows AI spend and signs out", () => {
    const onSignOut = vi.fn(() => Promise.resolve());
    open(createFixtureReadModels(), onSignOut);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByText("$1.43 of $5.00 this month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("says demo sign-out saved nothing", async () => {
    open(createFixtureReadModels(), vi.fn(() => Promise.reject(new DemoUnavailableError())));
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect((await screen.findByText("Not available yet — demo · nothing was saved")).textContent).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = open();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("subscribes once per month, not on every render", () => {
    const gateway = createFixtureReadModels();
    const watch = vi.spyOn(gateway, "watchExpenseEntries");
    const { rerender } = open(gateway);
    const calls = watch.mock.calls.length;
    rerender(<DashboardScreen gateway={gateway} nowMs={FIXTURE_NOW_MS} displayName="Demo" onSignOut={vi.fn(() => Promise.resolve())} />);
    expect(watch.mock.calls.length).toBe(calls);
  });

  it("shows recent messages even when the month has nothing recorded", () => {
    const gateway = new InMemoryReadModelGateway();
    gateway.setSourceEvents(createFixtureEvents().filter((e) => e.status === "pending"));
    open(gateway);
    expect(screen.getByText("Nothing recorded in November 2026")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Recent" })).getAllByText("Waiting for your answer").length).toBeGreaterThan(0);
  });

  it("keeps balances and unexplained cash on a month with no spending or income", () => {
    const gateway = createFixtureReadModels();
    gateway.setExpenseEntries([]);
    gateway.setIncomeEntries([]);
    open(gateway);
    expect(screen.getByText("Nothing recorded in November 2026")).toBeTruthy();
    expect(screen.getByRole("note", { name: "Cash not yet explained" }).textContent).toContain("৳5,000");
    expect(figure("Net money")).toContain("৳1,25,630");
    expect(screen.queryByRole("group", { name: "Spent" })).toBeNull();
  });

  it("the unexplained-cash box offers Count my cash, which opens the chat on the count", () => {
    const openChat = vi.fn();
    render(
      <ChatOpenerContext.Provider value={{ openChat }}>
        <DashboardScreen gateway={createFixtureReadModels()} nowMs={FIXTURE_NOW_MS} displayName="Demo" onSignOut={vi.fn(() => Promise.resolve())} />
      </ChatOpenerContext.Provider>,
    );
    const box = screen.getByRole("note", { name: "Cash not yet explained" });
    fireEvent.click(within(box).getByRole("button", { name: "Count my cash" }));
    expect(openChat).toHaveBeenCalledWith("cashCount");
  });

  it("without a chat to open, the box has no Count button", () => {
    open();
    const box = screen.getByRole("note", { name: "Cash not yet explained" });
    expect(within(box).queryByRole("button")).toBeNull();
  });
});
