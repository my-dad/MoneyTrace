/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { AdjustmentForm } from "./AdjustmentForm";
import type { CashSource } from "./cash-source";
import { createFixtureCashSource } from "./fixture-cash-source";

afterEach(cleanup);

const HOME = { id: "cash-home", name: "Home" };

describe("AdjustmentForm", () => {
  it("adjustment requires a cause", () => {
    const source = { ...createFixtureCashSource(), recordAdjustment: vi.fn<CashSource["recordAdjustment"]>() };
    render(<AdjustmentForm account={HOME} differenceMinor={-30_000} countedMinor={770_000} source={source} onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(screen.getByText("Choose what explains the difference.")).toBeTruthy();
    expect(source.recordAdjustment).not.toHaveBeenCalled();
  });

  it("sends the signed difference, the cause and the note", () => {
    const recordAdjustment = vi.fn<CashSource["recordAdjustment"]>(() => Promise.reject(new DemoUnavailableError()));
    render(<AdjustmentForm account={HOME} differenceMinor={-30_000} countedMinor={770_000} source={{ ...createFixtureCashSource(), recordAdjustment }} onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Spent and not recorded" }));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Bazar on Tuesday" } });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(recordAdjustment).toHaveBeenCalledWith({ accountId: "cash-home", amountMinor: -30_000, cause: "spentNotRecorded", note: "Bazar on Tuesday" });
  });

  it("review later records only the count, with no adjustment", () => {
    const recordAdjustment = vi.fn<CashSource["recordAdjustment"]>();
    const recordCashCount = vi.fn<CashSource["recordCashCount"]>(() => Promise.reject(new DemoUnavailableError()));
    render(<AdjustmentForm account={HOME} differenceMinor={-30_000} countedMinor={770_000} source={{ ...createFixtureCashSource(), recordAdjustment, recordCashCount }} onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /review later/ }));
    fireEvent.click(screen.getByRole("button", { name: "Leave for review" }));
    expect(recordCashCount).toHaveBeenCalledWith({ accountId: "cash-home", countedMinor: 770_000 });
    expect(recordAdjustment).not.toHaveBeenCalled();
  });

  it("submitting with the fixture source shows the demo-unavailable status", async () => {
    render(<AdjustmentForm account={HOME} differenceMinor={-30_000} countedMinor={770_000} source={createFixtureCashSource()} onBack={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "Counting mistake earlier" }));
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });
});
