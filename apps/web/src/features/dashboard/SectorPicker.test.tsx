/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { SectorPicker } from "./SectorPicker";

afterEach(cleanup);

const show = (tagMerchant: Parameters<typeof SectorPicker>[0]["tagMerchant"], onClose = vi.fn()) =>
  render(<SectorPicker merchantName="Foodpanda" merchantKey="foodpanda" tagMerchant={tagMerchant} onClose={onClose} />);

describe("SectorPicker", () => {
  it("offers every sector except Not sorted yet", () => {
    show(vi.fn());
    expect(screen.getByRole("dialog", { name: "Sort Foodpanda" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
      expect.arrayContaining(["Food", "Transport", "Groceries", "Shopping", "Bills & recharge", "Health", "Education", "Family", "Rent", "Other"]),
    );
    expect(screen.queryByRole("button", { name: "Not sorted yet" })).toBeNull();
  });

  it("sorts the merchant and says how many spends moved", async () => {
    const tagMerchant = vi.fn(() => Promise.resolve({ resorted: 3, more: false }));
    show(tagMerchant);
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    await screen.findByText("Sorted 3 spends from Foodpanda as Food.");
    expect(tagMerchant).toHaveBeenCalledWith({ merchantKey: "foodpanda", merchantName: "Foodpanda", sector: "food" });
  });

  it("keeps going while more remain, then reports the total", async () => {
    const replies = [{ resorted: 20, more: true }, { resorted: 4, more: false }];
    const tagMerchant = vi.fn(() => Promise.resolve(replies.shift() ?? { resorted: 0, more: false }));
    show(tagMerchant);
    fireEvent.click(screen.getByRole("button", { name: "Health" }));
    await screen.findByText("Sorted 24 spends from Foodpanda as Health.");
    expect(tagMerchant).toHaveBeenCalledTimes(2);
  });

  it("says future SMS will be sorted when nothing earlier needed moving", async () => {
    show(vi.fn(() => Promise.resolve({ resorted: 0, more: false })));
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    await screen.findByText("Foodpanda will be sorted as Food from now on.");
  });

  it("says the demo saved nothing", async () => {
    show(vi.fn(() => Promise.reject(new DemoUnavailableError())));
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    await waitFor(() => { expect(screen.getByRole("status").textContent).toMatch(/demo/i); });
  });

  it("says a failure honestly", async () => {
    show(vi.fn(() => Promise.reject(new Error("offline"))));
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    await waitFor(() => { expect(screen.getByRole("status").textContent).toMatch(/not|try again/i); });
  });

  it("Escape closes it", () => {
    const onClose = vi.fn();
    show(vi.fn(), onClose);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
