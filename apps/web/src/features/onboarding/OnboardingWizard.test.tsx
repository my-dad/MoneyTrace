/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { FIXTURE_ACCOUNTS } from "../../shared/fixtures/household";
import { OnboardingWizard } from "./OnboardingWizard";

afterEach(cleanup);

const ACCOUNTS = FIXTURE_ACCOUNTS.filter((account) => ["bank-dbbl", "cash-wallet", "card-amex"].includes(account.id));
const open = () => render(<OnboardingWizard commands={createFixtureCommands()} accounts={ACCOUNTS} />);
const next = () => { fireEvent.click(screen.getByRole("button", { name: "Next" })); };

describe("OnboardingWizard", () => {
  it("walks all five steps", async () => {
    open();
    expect(screen.getByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome to MoneyTrace" })).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Currency and reports" })).toBeTruthy();
    expect(screen.getByText("Bangladeshi taka (৳ BDT)")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Where your money sits" })).toBeTruthy();
    expect(screen.getByText("DBBL Savings")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "What each holds today" })).toBeTruthy();
    next();
    expect(screen.getByText("Step 5 of 5")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Gentle reminders" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("keeps values when going back", () => {
    open();
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Rahim" } });
    next();
    fireEvent.click(screen.getByRole("radio", { name: "Calendar month" }));
    next();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Calendar month" }).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText<HTMLInputElement>("What should we call you?").value).toBe("Rahim");
  });

  it("blocks start day 29", () => {
    open();
    next();
    fireEvent.change(screen.getByLabelText("Cycle starts on day"), { target: { value: "29" } });
    next();
    expect(screen.getByText("Choose a day from 1 to 28.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Currency and reports" })).toBeTruthy();
  });

  it("states opening balances are not income", () => {
    open();
    next();
    next();
    next();
    expect(screen.getByText(/starting positions, not income/)).toBeTruthy();
    expect(screen.getByLabelText("DBBL Savings")).toBeTruthy();
    expect(screen.getByLabelText("City Bank Amex ••7702 · you owe")).toBeTruthy();
  });

  it("refuses an opening balance that isn't a number", () => {
    open();
    next();
    next();
    next();
    fireEvent.change(screen.getByLabelText("Wallet"), { target: { value: "lots" } });
    next();
    expect(screen.getByText("Enter amounts in taka, like 3,500.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What each holds today" })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = open();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
