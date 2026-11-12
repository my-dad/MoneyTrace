/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountView } from "./accounts-view-model";
import { AllocationForm } from "./AllocationForm";
import type { CashSource } from "./cash-source";
import { createFixtureCashSource } from "./fixture-cash-source";

afterEach(cleanup);

const FROM: AccountView[] = [{ id: "cash-wallet", kind: "cash", name: "Wallet", amountMinor: 720_000, unexplained: false }];
const TO: AccountView[] = [{ id: "family-ammu", kind: "familyCash", name: "Ammu", amountMinor: 450_000, unexplained: false }];

const open = (source: CashSource = createFixtureCashSource()) =>
  render(<AllocationForm from={FROM} to={TO} source={source} onClose={vi.fn()} />);

describe("AllocationForm", () => {
  it("says it moves cash and isn't spending", () => {
    open();
    expect(screen.getByText(/This moves cash; it isn't spending/)).toBeTruthy();
    expect(screen.getByRole("option", { name: "Wallet · ৳7,200" })).toBeTruthy();
  });

  it("rejects non-numeric amounts", () => {
    const allocateCash = vi.fn<CashSource["allocateCash"]>();
    open({ ...createFixtureCashSource(), allocateCash });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Give cash" }));
    expect(screen.getByText("Enter an amount in taka, like 3,000.")).toBeTruthy();
    expect(allocateCash).not.toHaveBeenCalled();
  });

  it("refuses more than the source holds", () => {
    open();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "8000" } });
    fireEvent.click(screen.getByRole("button", { name: "Give cash" }));
    expect(screen.getByText("Wallet holds ৳7,200. Enter that or less.")).toBeTruthy();
  });

  it("submitting with the fixture source shows the demo-unavailable status", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "3,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Give cash" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("has no axe violations", async () => {
    const { container } = open();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
