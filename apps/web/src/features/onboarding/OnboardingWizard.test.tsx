/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { FIXTURE_ACCOUNTS } from "../../shared/fixtures/household";
import { OnboardingWizard } from "./OnboardingWizard";

afterEach(cleanup);

const ACCOUNTS = FIXTURE_ACCOUNTS.filter((account) => ["bank-dbbl", "cash-wallet", "card-amex"].includes(account.id));
const open = () => render(<OnboardingWizard commands={createFixtureCommands()} accounts={ACCOUNTS} />);
const next = () => { fireEvent.click(screen.getByRole("button", { name: "Next" })); };

describe("OnboardingWizard", () => {
  it("walks all four steps", async () => {
    open();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome to MoneyTrace" })).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Currency and reports" })).toBeTruthy();
    expect(screen.getByText("Bangladeshi taka (৳ BDT)")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Where your money sits" })).toBeTruthy();
    expect(screen.getByText("DBBL Savings")).toBeTruthy();
    next();
    expect(screen.getByText("Step 4 of 4")).toBeTruthy();
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

  it("has no axe violations", async () => {
    const { container } = open();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("lists a created account once when the read model echoes it", async () => {
    const commands = { ...createFixtureCommands(), createAccount: vi.fn(() => Promise.resolve({ accountId: "acc-new" })) };
    const view = render(<OnboardingWizard commands={commands} accounts={ACCOUNTS} />);
    next();
    next();
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Nagad" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another account" }));
    await screen.findByText("Nagad");
    view.rerender(<OnboardingWizard commands={commands} accounts={[...ACCOUNTS, { id: "acc-new", name: "Nagad", kind: "bank" }]} />);
    expect(screen.getAllByText("Nagad")).toHaveLength(1);
  });



  it("never asks for an opening balance or account digits (CR-006)", () => {
    open();
    for (let step = 1; step <= 4; step += 1) {
      expect(screen.queryByText(/opening balance|digits|holds today/i)).toBeNull();
      if (step < 4) next();
    }
  });

  it("finishes by saving the settings only, then moves on", async () => {
    const onDone = vi.fn();
    const updateSettings = vi.fn(() => Promise.resolve({ updated: true as const }));
    render(<OnboardingWizard commands={{ ...createFixtureCommands(), updateSettings }} accounts={ACCOUNTS} onDone={onDone} />);
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => { expect(onDone).toHaveBeenCalled(); });
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });
});
