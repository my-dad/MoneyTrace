/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { CashIncomeForm, type CashIncomeCommands } from "./CashIncomeForm";

afterEach(cleanup);

/** 25 Nov 2026, 22:00 in Dhaka. */
const NOW = Date.parse("2026-11-25T16:00:00Z");

const commands = (over: Partial<CashIncomeCommands> = {}): CashIncomeCommands => ({
  recordCashIncome: vi.fn(() => Promise.resolve({ sourceEventId: "se1", status: "posted" as const })),
  editManualIncome: vi.fn(() => Promise.resolve({ status: "recorded" as const })),
  ...over,
});

const amount = () => screen.getByLabelText("Amount (৳)");
const save = () => screen.getByRole("button", { name: "Save" });

describe("CashIncomeForm", () => {
  it("records cash income with today's Dhaka date and says what was recorded", async () => {
    const c = commands();
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={c} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Add cash income" })).toBeTruthy();
    fireEvent.change(amount(), { target: { value: "20,000" } });
    fireEvent.click(screen.getByRole("radio", { name: "House rent" }));
    fireEvent.click(save());
    await screen.findByText("Recorded ৳20,000 as House rent.");
    expect(c.recordCashIncome).toHaveBeenCalledWith({ idempotencyKey: expect.any(String) as string, amountMinor: 2_000_000, from: "rent", occurredOn: "2026-11-25" });
  });

  it("sends a note when one is written", async () => {
    const c = commands();
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={c} onClose={vi.fn()} />);
    fireEvent.change(amount(), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("radio", { name: "Gift" }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "from Nanu" } });
    fireEvent.click(save());
    await screen.findByText("Recorded ৳500 as Gift.");
    expect(c.recordCashIncome).toHaveBeenCalledWith(expect.objectContaining({ note: "from Nanu", from: "gift" }));
  });

  it("keeps Save off until there is an amount above zero and a source", () => {
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={commands()} onClose={vi.fn()} />);
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(amount(), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("radio", { name: "Salary" }));
    expect((save() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(amount(), { target: { value: "100" } });
    expect((save() as HTMLButtonElement).disabled).toBe(false);
  });

  it("refuses a day in the future", () => {
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={commands()} onClose={vi.fn()} />);
    fireEvent.change(amount(), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("radio", { name: "Salary" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-26" } });
    expect(screen.getByText("Pick today or an earlier day.")).toBeTruthy();
    expect((save() as HTMLButtonElement).disabled).toBe(true);
  });

  it("edits an income, prefilled", async () => {
    const c = commands();
    render(<CashIncomeForm mode={{ kind: "edit", sourceEventId: "se9", amountMinor: 2_000_000, from: "rent" }} nowMs={NOW} commands={c} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Edit cash income" })).toBeTruthy();
    expect((amount() as HTMLInputElement).value).toBe("20000");
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "House rent" }).checked).toBe(true);
    fireEvent.change(amount(), { target: { value: "18000" } });
    fireEvent.click(save());
    await screen.findByText("Updated to ৳18,000 as House rent.");
    expect(c.editManualIncome).toHaveBeenCalledWith({ idempotencyKey: expect.any(String) as string, sourceEventId: "se9", amountMinor: 1_800_000, from: "rent" });
  });

  it("reuses the key when the same entry is retried after a failure", async () => {
    const record = vi.fn<CashIncomeCommands["recordCashIncome"]>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ sourceEventId: "se1", status: "posted" });
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={commands({ recordCashIncome: record })} onClose={vi.fn()} />);
    fireEvent.change(amount(), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("radio", { name: "Salary" }));
    fireEvent.click(save());
    await waitFor(() => { expect(screen.getByRole("status").textContent).toMatch(/nothing was saved/); });
    fireEvent.click(save());
    await screen.findByText("Recorded ৳100 as Salary.");
    expect(record.mock.calls[0]?.[0].idempotencyKey).toBe(record.mock.calls[1]?.[0].idempotencyKey);
  });

  it("says the demo saved nothing", async () => {
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={commands({ recordCashIncome: () => Promise.reject(new DemoUnavailableError()) })} onClose={vi.fn()} />);
    fireEvent.change(amount(), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("radio", { name: "Salary" }));
    fireEvent.click(save());
    await waitFor(() => { expect(screen.getByRole("status").textContent).toMatch(/demo/); });
  });

  it("Escape closes it", () => {
    const onClose = vi.fn();
    render(<CashIncomeForm mode={{ kind: "add" }} nowMs={NOW} commands={commands()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
