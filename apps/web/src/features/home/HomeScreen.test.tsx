/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryReadModelGateway } from "../../shared/in-memory-read-model-gateway";
import type { AccountRow, BalanceRow, FollowUpRow } from "../../shared/read-model-gateway";
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

  it("the unexplained card opens the question", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    expect(screen.getByText("Where did it go?")).toBeTruthy();
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
