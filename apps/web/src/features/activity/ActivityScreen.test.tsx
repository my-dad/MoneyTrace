/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { FIXTURE_NOW_MS } from "../../shared/fixtures/household";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { ReadModelGateway } from "../../shared/read-model-gateway";
import { ActivityScreen } from "./ActivityScreen";

afterEach(cleanup);

const stalled: ReadModelGateway = {
  watchAccounts: () => () => undefined,
  watchBalances: () => () => undefined,
  watchFollowUps: () => () => undefined,
  watchSourceEvents: () => () => undefined,
  watchExpenseEntries: () => () => undefined,
  watchIncomeEntries: () => () => undefined,
  watchAiUsage: () => () => undefined,
};

function renderScreen(gateway: ReadModelGateway = createFixtureReadModels(), selectedId: string | null = null) {
  const onSelect = vi.fn();
  const view = render(
    <ActivityScreen gateway={gateway} commands={createFixtureCommands()} selectedId={selectedId} onSelect={onSelect} nowMs={FIXTURE_NOW_MS} />,
  );
  return { ...view, onSelect };
}

const rows = () => within(screen.getByRole("region", { name: "Activity list" })).getAllByRole("button", { name: /৳|—/ });

describe("ActivityScreen", () => {
  it("shows loading until events arrive", () => {
    renderScreen(stalled);
    expect(screen.getByRole("status").textContent).toBe("Loading your activity…");
  });

  it("shows items grouped by day, newest first", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Today · Fri 6 Nov" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Yesterday · Thu 5 Nov" })).toBeTruthy();
    expect(rows()[0]?.textContent).toContain("Txn of BDT 750.00");
    expect(rows()[1]?.textContent).toContain("Gave some cash to Ammu");
  });

  it("shows the empty state", () => {
    renderScreen(new InMemoryReadModelGateway());
    expect(screen.getByRole("heading", { name: "No activity yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Chat" }).getAttribute("href")).toBe("/chat");
  });

  it("shows the read error and retries", () => {
    const gateway = createFixtureReadModels();
    renderScreen(gateway);
    act(() => { gateway.fail("sourceEvents"); });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your activity");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rows().length).toBeGreaterThan(0);
  });

  it("filters by chip and shows an empty filter state", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /Duplicates/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain("Not counted twice");
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(screen.getByRole("heading", { name: "Nothing pending" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(rows().length).toBe(12);
  });

  it("shows a withdrawal amount without spending styling", () => {
    renderScreen();
    const withdrawal = rows().find((row) => row.textContent.includes("Transfer: Bank → Cash"));
    expect(withdrawal?.textContent).toContain("৳5,000");
    expect(withdrawal?.textContent).not.toContain("+");
  });

  it("selecting an item asks to open it", () => {
    const { onSelect } = renderScreen();
    const [first] = rows();
    if (first === undefined) throw new Error("no rows");
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith("se-dead");
  });

  it("shows the selected item's detail", () => {
    renderScreen(createFixtureReadModels(), "se-amex-shwapno");
    expect(screen.getByRole("region", { name: "Transaction detail" }).textContent).toContain("SHWAPNO GULSHAN");
  });

  it("has no axe violations", async () => {
    const { container } = renderScreen(createFixtureReadModels(), "se-amex-shwapno");
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
