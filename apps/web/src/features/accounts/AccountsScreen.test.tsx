/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Commands } from "../../shared/commands";
import type { AccountRow } from "../../shared/read-model-gateway";
import { AccountsScreen } from "./AccountsScreen";

afterEach(cleanup);

const EXISTING: AccountRow = {
  id: "amex",
  kind: "creditLiability",
  name: "Amex",
  currency: "BDT",
  status: "active",
  createdAtMs: 1,
};

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

  async function reachOpeningForm(
    fake: ReturnType<typeof commands>,
    kind: "bank" | "cash" | "creditLiability" = "bank",
  ) {
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "My account" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: kind } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByLabelText("Opening balance");
  }

  const saveOpening = (value: string) => {
    fireEvent.change(screen.getByLabelText("Opening balance"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save opening balance" }));
  };

  it("a card's opening balance: what you owe is positive, as the server reads it", async () => {
    const fake = commands();
    await reachOpeningForm(fake, "creditLiability");
    expect(screen.getByRole("main").textContent).toMatch(/what you owe as a positive amount/i);
    expect(screen.getByRole("main").textContent).toMatch(/negative amount means the card is in credit/i);
    expect(screen.getByRole("main").textContent).not.toMatch(/negative amount means you owe/i);
    saveOpening("18,450");
    await waitFor(() => {
      expect(fake.recordOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: 1845000 }),
      );
    });
  });

  it("a negative amount reaches the server negative", async () => {
    const fake = commands();
    await reachOpeningForm(fake);
    saveOpening("-500");
    await waitFor(() => {
      expect(fake.recordOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinor: -50000 }),
      );
    });
  });

  it("a mobile wallet needs a provider and no digits", async () => {
    const fake = commands();
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "bKash" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "mobileWallet" } });
    expect(screen.queryByLabelText("Last 3 or 4 digits")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "bkash" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payment details" }));
    await waitFor(() => {
      expect(fake.createAccount).toHaveBeenCalledWith({ kind: "bank", name: "bKash", currency: "BDT" });
      expect(fake.createPaymentInstrument).toHaveBeenCalledWith({
        accountId: "bank-1",
        provider: "bkash",
        maskedIdentifier: "",
        type: "mobileWallet",
      });
    });
    await screen.findByLabelText("Opening balance");
  });

  it("cash has no digits and no payment details step", async () => {
    const fake = commands();
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Wallet" } });
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "cash" } });
    expect(screen.queryByLabelText("Last 3 or 4 digits")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await screen.findByLabelText("Opening balance");
    expect(fake.createPaymentInstrument).not.toHaveBeenCalled();
  });

  it("a failed account save says so and stays on the form", async () => {
    const fake = commands();
    vi.mocked(fake.createAccount).mockRejectedValueOnce(new Error("offline"));
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/wasn't saved/);
    expect(screen.getByLabelText("Account name")).toBeTruthy();
  });

  it("a failed payment details save says so", async () => {
    const fake = commands();
    vi.mocked(fake.createPaymentInstrument).mockRejectedValueOnce(new Error("offline"));
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
    fireEvent.change(screen.getByLabelText("Last 3 or 4 digits"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "ucb" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payment details" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/wasn't saved/);
  });

  it("a failed opening balance says so", async () => {
    const fake = commands();
    vi.mocked(fake.recordOpeningBalance).mockRejectedValueOnce(new Error("offline"));
    await reachOpeningForm(fake);
    saveOpening("500");
    expect((await screen.findByRole("alert")).textContent).toMatch(/wasn't saved/);
    expect(screen.queryByText("Opening balance saved.")).toBeNull();
  });

  it("a changed opening balance shows the already-recorded message", async () => {
    const fake = commands();
    vi.mocked(fake.recordOpeningBalance).mockResolvedValueOnce({
      transactionId: "opening-1",
      status: "alreadyRecorded",
    });
    await reachOpeningForm(fake);
    saveOpening("500");
    expect((await screen.findByRole("status")).textContent).toMatch(/already recorded/i);
  });

  it("a double tap creates one account", async () => {
    const fake = commands();
    let finish: (value: { accountId: string }) => void = () => undefined;
    vi.mocked(fake.createAccount).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<AccountsScreen accounts={[]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: /add account/i }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    finish({ accountId: "bank-1" });
    await screen.findByLabelText("Opening balance");
    expect(fake.createAccount).toHaveBeenCalledOnce();
  });

  it("an existing account can get its opening balance later, and the form has a way back", async () => {
    const fake = commands();
    render(<AccountsScreen accounts={[EXISTING]} commands={fake} />);
    fireEvent.click(screen.getByRole("button", { name: "Set opening balance for Amex" }));
    expect(screen.getByRole("main").textContent).toMatch(/what you owe/i);
    saveOpening("500");
    await waitFor(() => {
      expect(fake.recordOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "amex", amountMinor: 50000 }),
      );
    });
    expect(fake.createAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to accounts" }));
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeTruthy();
  });

  it("names account kinds in plain words and hides the system wallet", () => {
    render(
      <AccountsScreen
        accounts={[EXISTING, { ...EXISTING, id: "cash-unassigned", name: "Cash · place not set" }]}
        commands={commands()}
      />,
    );
    expect(screen.getByText("Credit card")).toBeTruthy();
    expect(screen.queryByText("creditLiability")).toBeNull();
    expect(screen.queryByText(/place not set/)).toBeNull();
  });

  it("a read failure says so rather than looking like no accounts", () => {
    render(<AccountsScreen accounts={[]} commands={commands()} readFailed />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load/i);
  });

  describe("the as-of date", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("defaults to today in Dhaka, not UTC", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.parse("2026-11-06T20:00:00Z"));
      await reachOpeningForm(commands());
      expect(screen.getByLabelText<HTMLInputElement>("As of date").value).toBe("2026-11-07");
    });

    it("can't be in the future", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.parse("2026-11-06T20:00:00Z"));
      const fake = commands();
      await reachOpeningForm(fake);
      fireEvent.change(screen.getByLabelText("As of date"), { target: { value: "2026-11-08" } });
      saveOpening("500");
      expect((await screen.findByRole("alert")).textContent).toMatch(/future/);
      expect(fake.recordOpeningBalance).not.toHaveBeenCalled();
    });

    it("means the start of that date in Dhaka", async () => {
      const fake = commands();
      await reachOpeningForm(fake);
      fireEvent.change(screen.getByLabelText("As of date"), { target: { value: "2026-11-02" } });
      saveOpening("500");
      await waitFor(() => {
        expect(fake.recordOpeningBalance).toHaveBeenCalledWith(
          expect.objectContaining({ effectiveAtMs: Date.parse("2026-11-01T18:00:00Z") }),
        );
      });
    });
  });

  describe("axe", () => {
    const run = async (container: HTMLElement) => {
      const results = await axe.run(container, {
        rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
      });
      expect(results.violations.map((v) => v.id)).toEqual([]);
    };

    it("list", async () => {
      await run(render(<AccountsScreen accounts={[EXISTING]} commands={commands()} />).container);
    });

    it("add account form", async () => {
      const { container } = render(<AccountsScreen accounts={[]} commands={commands()} />);
      fireEvent.click(screen.getByRole("button", { name: /add account/i }));
      await run(container);
    });

    it("payment details", async () => {
      const { container } = render(<AccountsScreen accounts={[]} commands={commands()} />);
      fireEvent.click(screen.getByRole("button", { name: /add account/i }));
      fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "City Bank" } });
      fireEvent.change(screen.getByLabelText("Last 3 or 4 digits"), { target: { value: "4821" } });
      fireEvent.click(screen.getByRole("button", { name: "Save account" }));
      await screen.findByLabelText("Provider");
      await run(container);
    });

    it("opening balance", async () => {
      await reachOpeningForm(commands());
      await run(document.body);
    });
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
