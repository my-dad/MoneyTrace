/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Commands } from "../../shared/commands";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import { toActivityItems } from "./activity-view-model";
import { CorrectionSheet } from "./CorrectionSheet";

afterEach(cleanup);

const found = toActivityItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS).find((item) => item.id === "se-amex-shwapno");
if (found === undefined) throw new Error("missing fixture item");
const posted = found;

describe("CorrectionSheet", () => {
  it("requires a reason", () => {
    const correct = vi.fn();
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).not.toHaveBeenCalled();
    expect(screen.getByText("Add a reason so the history explains this change.")).toBeTruthy();
  });

  it("rejects an amount it can't read", () => {
    const correct = vi.fn();
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("New amount"), { target: { value: "two thousand" } });
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Wrong amount" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the amount in taka, like 2,150.")).toBeTruthy();
  });

  it("sends a correction with the replacement amount", () => {
    const correct = vi.fn(() => Promise.resolve({ reversalTransactionId: "r", replacementTransactionId: "n", status: "recorded" as const }));
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("New amount"), { target: { value: "2,100" } });
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Receipt says 2,100" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).toHaveBeenCalledWith(expect.objectContaining({
      transactionId: "txn-se-amex-shwapno",
      replacement: { amountMinor: 210_000, currency: "BDT" },
      rationale: "Receipt says 2,100",
    }));
  });

  it("a reversal sends no replacement", () => {
    const correct = vi.fn<Commands["correctTransaction"]>(() => Promise.resolve({ reversalTransactionId: "r", status: "recorded" as const }));
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Reverse it" }));
    expect(screen.queryByLabelText("New amount")).toBeNull();
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Declined at the till" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reversal" }));
    expect(correct.mock.calls[0]?.[0]).not.toHaveProperty("replacement");
  });

  it("shows the demo-unavailable status after submitting with fixture commands and never says Recorded", async () => {
    render(<CorrectionSheet item={posted} correctTransaction={createFixtureCommands().correctTransaction} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Reverse it" }));
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Declined" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reversal" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
    expect(document.body.textContent).not.toMatch(/Recorded/);
  });

  it("reports the server-confirmed result", async () => {
    const correct = vi.fn(() => Promise.resolve({ reversalTransactionId: "r", status: "recorded" as const }));
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Reverse it" }));
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Declined" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reversal" }));
    expect((await screen.findByRole("status")).textContent).toMatch(/^Reversal recorded · saved to your ledger\./);
  });

  it("keeps reporting what was saved and notes the list doesn't show corrections yet", async () => {
    const correct = vi.fn(() => Promise.resolve({ reversalTransactionId: "r", status: "recorded" as const }));
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Reverse it" }));
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Not mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reversal" }));
    const status = await screen.findByText(/Reversal recorded/);
    expect(status.textContent).toContain("This list doesn't show corrections yet");
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Correct it" }).disabled).toBe(true);
  });

  it("says when the correction was already recorded", async () => {
    const correct = vi.fn(() => Promise.resolve({ reversalTransactionId: "r", status: "alreadyRecorded" as const }));
    render(<CorrectionSheet item={posted} correctTransaction={correct} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Reverse it" }));
    fireEvent.change(screen.getByLabelText("Why? (required)"), { target: { value: "Not mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reversal" }));
    expect((await screen.findByText(/already recorded/)).textContent).toBe("This change was already recorded, so nothing new was saved.");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<CorrectionSheet item={posted} correctTransaction={vi.fn()} onClose={onClose} />);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
