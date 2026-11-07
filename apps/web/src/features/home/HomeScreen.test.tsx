/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type {
  AccountRow,
  BalanceRow,
  FollowUpRow,
  ReadModelGateway,
} from "../../shared/read-model-gateway";
import { HomeScreen } from "./HomeScreen";

afterEach(cleanup);

const account = (id: string, kind: AccountRow["kind"], name = id): AccountRow => ({
  id,
  kind,
  name,
  currency: "BDT",
  status: "active",
  createdAtMs: 1,
});
const balance = (
  accountId: string,
  accountKind: BalanceRow["accountKind"],
  amount: number,
): BalanceRow => ({
  accountId,
  accountKind,
  currency: "BDT",
  debitMinusCreditMinor: amount,
  version: 1,
  updatedAtMs: 2,
});

function gatewayWith(
  data: { accounts?: AccountRow[]; balances?: BalanceRow[]; followUps?: FollowUpRow[] } = {},
) {
  const gateway = new InMemoryReadModelGateway();
  gateway.setAccounts(data.accounts ?? []);
  gateway.setBalances(data.balances ?? []);
  gateway.setFollowUps(data.followUps ?? []);
  return gateway;
}

/** Never delivers data; the named streams fail at once. */
function stalledGateway(failing: ("accounts" | "balances" | "expenses")[] = []): ReadModelGateway {
  const stream = (name: "accounts" | "balances" | "expenses", onError?: (error: Error) => void) => {
    if (failing.includes(name)) onError?.(new Error("denied"));
    return () => undefined;
  };
  return {
    watchAccounts: (_onValue, onError) => stream("accounts", onError),
    watchBalances: (_onValue, onError) => stream("balances", onError),
    watchFollowUps: () => () => undefined,
    watchSourceEvents: () => () => undefined,
    watchExpenseEntries: (_from, _to, _onValue, onError) => stream("expenses", onError),
  };
}

describe("HomeScreen", () => {
  it("shows the three figures and separates card dues from available", () => {
    render(
      <HomeScreen
        gateway={gatewayWith({
          accounts: [
            account("bank", "bank"),
            account("cash", "cash"),
            account("card", "creditLiability"),
          ],
          balances: [
            balance("bank", "bank", 100000),
            balance("cash", "cash", 20000),
            balance("card", "creditLiability", -35000),
          ],
        })}
        displayName="Mabrur"
      />,
    );
    expect(screen.getByText("৳1,200")).toBeTruthy();
    expect(screen.getByText("৳350")).toBeTruthy();
    expect(screen.getByText(/Money you owe/)).toBeTruthy();
  });

  it("Explain goes to chat, even while the question isn't due yet", () => {
    const followUp: FollowUpRow = {
      id: "f",
      trigger: "withdrawalDestination",
      question: "Where did it go?",
      dueAtMs: Date.now() + 86_400_000,
      snoozedUntilMs: null,
      state: "open",
      createdAtMs: 1,
      resolvedAtMs: null,
    };
    render(
      <HomeScreen
        gateway={gatewayWith({
          accounts: [account("bank", "bank")],
          balances: [balance("cash-unassigned", "cash", 50000)],
          followUps: [followUp],
        })}
        displayName="Mabrur"
      />,
    );
    expect(screen.getByRole("link", { name: "Explain" }).getAttribute("href")).toBe("/chat");
    expect(screen.queryByText(/No question is ready/)).toBeNull();
  });

  it("the unexplained card never implies the cash was spent or lost", () => {
    render(
      <HomeScreen
        gateway={gatewayWith({
          accounts: [account("bank", "bank")],
          balances: [balance("cash-unassigned", "cash", 50000)],
        })}
      />,
    );
    const main = screen.getByRole("main").textContent;
    expect(main).toContain("isn't treated as spending");
    expect(main).not.toMatch(/\bsafe\b|missing|lost|unaccounted/i);
  });

  it("a due question's Open goes to chat", () => {
    const followUp: FollowUpRow = {
      id: "f",
      trigger: "withdrawalDestination",
      question: "Where did it go?",
      dueAtMs: 1,
      snoozedUntilMs: null,
      state: "open",
      createdAtMs: 1,
      resolvedAtMs: null,
    };
    render(<HomeScreen gateway={gatewayWith({ accounts: [account("bank", "bank")], followUps: [followUp] })} />);
    expect(screen.getByText("Where did it go?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/chat");
  });

  it("Home always offers a way into chat", () => {
    render(<HomeScreen gateway={gatewayWith({ accounts: [account("bank", "bank")] })} />);
    expect(screen.getByRole("link", { name: /paste a bank sms/i }).getAttribute("href")).toBe("/chat");
  });

  it("shows when the figures last changed, not a hardcoded just now", () => {
    render(
      <HomeScreen
        gateway={gatewayWith({
          accounts: [account("bank", "bank")],
          balances: [{ ...balance("bank", "bank", 100000), updatedAtMs: Date.parse("2026-11-06T12:42:00Z") }],
        })}
      />,
    );
    const main = screen.getByRole("main").textContent;
    expect(main).toContain("6 Nov");
    expect(main).toContain("6:42");
    expect(main).not.toMatch(/just now/i);
  });

  it("while accounts load it says so, instead of offering setup", () => {
    render(<HomeScreen gateway={stalledGateway()} />);
    expect(screen.getByRole("status").textContent).toMatch(/loading/i);
    expect(screen.queryByText(/set up your first account/i)).toBeNull();
  });

  it("if accounts can't load it says so, instead of offering setup", () => {
    render(<HomeScreen gateway={stalledGateway(["accounts"])} />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load/i);
    expect(screen.queryByText(/set up your first account/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /add account/i })).toBeNull();
  });

  it("if balances can't load it shows no figures rather than ৳0", () => {
    const stalled = stalledGateway(["balances"]);
    const accounts = gatewayWith({ accounts: [account("bank", "bank")] });
    render(
      <HomeScreen
        gateway={{ ...stalled, watchAccounts: (onValue) => accounts.watchAccounts(onValue) }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load/i);
    expect(screen.getByRole("main").textContent).not.toContain("৳0");
  });

  it("if spending can't load it shows no ৳0 spending", () => {
    const stalled = stalledGateway(["expenses"]);
    const data = gatewayWith({
      accounts: [account("bank", "bank")],
      balances: [balance("bank", "bank", 100000)],
    });
    render(
      <HomeScreen
        gateway={{
          ...stalled,
          watchAccounts: (onValue) => data.watchAccounts(onValue),
          watchBalances: (onValue) => data.watchBalances(onValue),
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load/i);
    expect(screen.queryByText("Spending this month")).toBeNull();
  });

  it.each([
    ["new user", () => gatewayWith()],
    ["loading", () => stalledGateway()],
    ["failed", () => stalledGateway(["accounts"])],
    [
      "figures and an unexplained card",
      () =>
        gatewayWith({
          accounts: [account("bank", "bank")],
          balances: [balance("bank", "bank", 100000), balance("cash-unassigned", "cash", 50000)],
        }),
    ],
  ] as [string, () => ReadModelGateway][])("has no axe violations: %s", async (_name, gateway) => {
    const { container } = render(<HomeScreen gateway={gateway()} onAddAccount={vi.fn()} />);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it("a new user sees setup rather than zeroed figures", () => {
    render(<HomeScreen gateway={gatewayWith()} displayName="Mabrur" onAddAccount={vi.fn()} />);
    expect(screen.getByText(/Let's set up your first account/)).toBeTruthy();
    expect(screen.queryByText("৳0.00")).toBeNull();
  });

  it("a listener error shows a failure message", () => {
    const gateway = gatewayWith({ accounts: [account("bank", "bank")] });
    render(<HomeScreen gateway={gateway} displayName="Mabrur" />);
    act(() => {
      gateway.fail("accounts");
    });
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load/i);
  });
});
