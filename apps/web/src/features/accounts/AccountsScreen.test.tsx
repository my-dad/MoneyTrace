/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Commands } from "../../shared/commands";
import { AccountsScreen } from "./AccountsScreen";

afterEach(cleanup);

const commands = (): Pick<
  Commands,
  "createAccount" | "createPaymentInstrument" | "recordOpeningBalance"
> => ({
  createAccount: vi.fn(() => Promise.resolve({ accountId: "bank-1" })),
  createPaymentInstrument: vi.fn(() => Promise.resolve({ instrumentId: "instrument-1" })),
  recordOpeningBalance: vi.fn(() =>
    Promise.resolve({ transactionId: "opening-1", status: "recorded" as const }),
  ),
});

describe("AccountsScreen", () => {
  it("accepts a short identifier, requires a provider, and rejects a full number", async () => {
    const fake = commands();
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
    fireEvent.change(screen.getByLabelText("Last 3 or 4 digits"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect(screen.getByText(/Use only the last 3 or 4 digits/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Last 3 or 4 digits"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() => { expect(screen.getByText(/provider is required/i)).toBeTruthy(); });
  });

  it("shows the opening balance meaning and converts taka exactly", async () => {
    const fake = commands();
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() => { expect(screen.getByLabelText("Opening balance")).toBeTruthy(); });
    fireEvent.change(screen.getByLabelText("Opening balance"), {
      target: { value: "৳1,25,000.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save opening balance" }));
    expect(fake.recordOpeningBalance).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 12500050 }),
    );
    expect(screen.getByText(/negative amount means/)).toBeTruthy();
  });
});
