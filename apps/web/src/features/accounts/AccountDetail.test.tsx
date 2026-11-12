/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountDetail } from "./AccountDetail";
import type { AccountView } from "./accounts-view-model";
import { createFixtureCashSource } from "./fixture-cash-source";

afterEach(cleanup);

const DBBL: AccountView = { id: "bank-dbbl", kind: "bank", name: "DBBL Savings", amountMinor: 8_200_000, unexplained: false };
const AMEX: AccountView = { id: "card-amex", kind: "creditLiability", name: "City Bank Amex", amountMinor: 1_845_000, unexplained: false };
const UNEXPLAINED: AccountView = { id: "cash-unassigned", kind: "cash", name: "Cash · place not set", amountMinor: 500_000, unexplained: true };

describe("AccountDetail", () => {
  it("lists linked instruments", async () => {
    render(<AccountDetail account={DBBL} source={createFixtureCashSource()} onBack={vi.fn()} />);
    expect(screen.getByText("Balance")).toBeTruthy();
    expect(screen.getByText("৳82,000")).toBeTruthy();
    expect(await screen.findByText("Debit card ••4821")).toBeTruthy();
    expect(screen.getByText(/isn't a separate account/)).toBeTruthy();
    expect(await screen.findByText("+৳85,000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all in Activity" }).getAttribute("href")).toBe("/activity");
  });

  it("shows card due and states repayment is not an expense", async () => {
    render(<AccountDetail account={AMEX} source={createFixtureCashSource()} onBack={vi.fn()} />);
    expect(screen.getByText("You owe")).toBeTruthy();
    expect(await screen.findByText("Statement due 15 Nov · ৳18,450")).toBeTruthy();
    expect(screen.getByText(/A repayment is not an expense/)).toBeTruthy();
  });

  it("explains unexplained cash as not spending and points to Chat", () => {
    render(<AccountDetail account={UNEXPLAINED} source={createFixtureCashSource()} onBack={vi.fn()} />);
    expect(screen.getByText("Not yet explained")).toBeTruthy();
    expect(screen.getByText(/isn't counted as spending/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer in Chat" }).getAttribute("href")).toBe("/chat");
  });

  it("shows Not available yet when cash source is null", () => {
    render(<AccountDetail account={DBBL} source={null} onBack={vi.fn()} />);
    expect(screen.getByText("৳82,000")).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.queryByText("Debit card ••4821")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<AccountDetail account={DBBL} source={createFixtureCashSource()} onBack={vi.fn()} />);
    await screen.findByText("Debit card ••4821");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
