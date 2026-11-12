/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ACCOUNTS, FIXTURE_BALANCES } from "../../shared/fixtures/household";
import { createFixtureReadModels } from "../../shared/fixtures/fixture-read-models";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { ReadModelGateway } from "../../shared/read-model-gateway";
import { AccountsHome } from "./AccountsHome";
import { createFixtureCashSource } from "./fixture-cash-source";

afterEach(cleanup);

const SILENT: ReadModelGateway = {
  watchAccounts: () => () => undefined,
  watchBalances: () => () => undefined,
  watchFollowUps: () => () => undefined,
  watchSourceEvents: () => () => undefined,
  watchExpenseEntries: () => () => undefined,
};

const renderHome = (gateway: ReadModelGateway = createFixtureReadModels(), selectedId: string | null = null) => {
  const onSelect = vi.fn();
  const view = render(<AccountsHome gateway={gateway} source={createFixtureCashSource()} selectedId={selectedId} onSelect={onSelect} />);
  return { ...view, onSelect };
};

describe("AccountsHome", () => {
  it("shows totals that match the fixture", () => {
    renderHome();
    expect(screen.getByText("Available ৳1,50,200 · Cards owed ৳24,570")).toBeTruthy();
    const bank = screen.getByRole("region", { name: "Bank & wallets" });
    expect(within(bank).getByText("৳1,25,500")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Cash" })).getByText("৳20,200")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Credit cards · you owe" })).getAllByText("owed")).toHaveLength(2);
  });

  it("shows the 5,000 as not yet explained with no danger styling", () => {
    const { container } = renderHome();
    const row = screen.getByRole("button", { name: /Not yet explained/ });
    expect(within(row).getByText("৳5,000")).toBeTruthy();
    expect(within(row).getByText("Needs answer")).toBeTruthy();
    expect(row.textContent).toContain("not spending");
    expect(container.querySelector("[class*='failed'], [class*='danger']")).toBeNull();
  });

  it("opens an account through onSelect", () => {
    const { onSelect } = renderHome();
    fireEvent.click(screen.getByRole("button", { name: /DBBL Savings/ }));
    expect(onSelect).toHaveBeenCalledWith("bank-dbbl");
  });

  it("shows the selected account's detail", async () => {
    renderHome(createFixtureReadModels(), "card-amex");
    const detail = screen.getByRole("region", { name: "Account detail" });
    expect(within(detail).getByText("You owe")).toBeTruthy();
    expect(await within(detail).findByText(/not an expense/i)).toBeTruthy();
  });

  it("links Add account to the setup form", () => {
    renderHome();
    expect(screen.getByRole("link", { name: "Add account" }).getAttribute("href")).toBe("/accounts/new");
  });

  it("opens the cash count and give-cash flows", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Count cash" }));
    expect(screen.getByRole("dialog", { name: "Count cash" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Give cash to family" }));
    expect(screen.getByRole("dialog", { name: "Give cash to family" })).toBeTruthy();
  });

  it("shows loading until accounts and balances arrive", () => {
    renderHome(SILENT);
    expect(screen.getByRole("status").textContent).toBe("Loading your accounts…");
    expect(screen.queryByText(/৳/)).toBeNull();
  });

  it("shows no figures when a read fails, and retries", () => {
    let calls = 0;
    const failing: ReadModelGateway = {
      ...SILENT,
      watchAccounts: (onValue, onError) => {
        calls += 1;
        if (calls === 1) onError?.(new Error("denied"));
        else onValue(FIXTURE_ACCOUNTS);
        return () => undefined;
      },
      watchBalances: (onValue) => { onValue(FIXTURE_BALANCES); return () => undefined; },
    };
    renderHome(failing);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your accounts");
    expect(screen.queryByText(/৳/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Available ৳1,50,200 · Cards owed ৳24,570")).toBeTruthy();
  });

  it("invites a new user to add a first account", () => {
    const gateway = new InMemoryReadModelGateway();
    gateway.setAccounts(FIXTURE_ACCOUNTS.filter((account) => account.id === "cash-unassigned"));
    gateway.setBalances([]);
    renderHome(gateway);
    expect(screen.getByText("Add your first account")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add account" }).getAttribute("href")).toBe("/accounts/new");
  });

  it("has no axe violations", async () => {
    const { container } = renderHome();
    const result = await axe.run(container);
    expect(result.violations).toEqual([]);
  });
});
