/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountView } from "./accounts-view-model";
import { CashCountFlow } from "./CashCountFlow";
import { createFixtureCashSource } from "./fixture-cash-source";

afterEach(cleanup);

const CASH: AccountView[] = [
  { id: "cash-wallet", kind: "cash", name: "Wallet", amountMinor: 720_000, unexplained: false },
  { id: "cash-home", kind: "cash", name: "Home", amountMinor: 800_000, unexplained: false },
];

const open = () => render(<CashCountFlow accounts={CASH} source={createFixtureCashSource()} onClose={vi.fn()} />);
const count = (account: string, amount: string) => {
  fireEvent.change(screen.getByLabelText("Which cash?"), { target: { value: account } });
  fireEvent.change(screen.getByLabelText("How much is there now?"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

describe("CashCountFlow", () => {
  it("rejects non-numeric amounts", () => {
    open();
    count("cash-home", "about seven thousand");
    expect(screen.getByText("Enter an amount in taka, like 7,700.")).toBeTruthy();
    expect(screen.getByLabelText("How much is there now?")).toBeTruthy();
  });

  it("shows the difference without calling it spending", () => {
    open();
    count("cash-home", "7,700");
    expect(screen.getByText("Expected ৳8,000")).toBeTruthy();
    expect(screen.getByText("৳300 less than expected")).toBeTruthy();
    expect(screen.getByText(/isn't counted as spending/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("group", { name: "What explains it? (required)" })).toBeTruthy();
    expect(screen.getByText("Home · ৳300 less than expected")).toBeTruthy();
  });

  it("submitting a matching count with the fixture source shows the demo-unavailable status", async () => {
    open();
    count("cash-wallet", "7200");
    expect(screen.getByText("Matches what's expected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save count" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("has no axe violations", async () => {
    const { container } = open();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
