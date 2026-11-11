/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import { findOriginal, toActivityItems } from "./activity-view-model";
import { ActivityDetail } from "./ActivityDetail";

afterEach(cleanup);

const items = toActivityItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS);
const item = (id: string) => {
  const found = items.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing ${id}`);
  return found;
};

describe("ActivityDetail", () => {
  it("shows the source SMS text and provenance", () => {
    render(<ActivityDetail item={item("se-amex-shwapno")} original={null} onBack={vi.fn()} onOpen={vi.fn()} onCorrect={vi.fn()} />);
    expect(screen.getByText(/Card \*\*7702 used for BDT 2,150.00/)).toBeTruthy();
    expect(screen.getByText("Read by the city-sms parser (v1)")).toBeTruthy();
    expect(screen.getByText(/Recorded · saved to your ledger/)).toBeTruthy();
    expect(screen.getByText("City Bank Amex ••7702")).toBeTruthy();
  });

  it("offers correction only for a posted item", () => {
    const onCorrect = vi.fn();
    render(<ActivityDetail item={item("se-amex-shwapno")} original={null} onBack={vi.fn()} onOpen={vi.fn()} onCorrect={onCorrect} />);
    fireEvent.click(screen.getByRole("button", { name: "Correct or reverse" }));
    expect(onCorrect).toHaveBeenCalled();
    cleanup();
    render(<ActivityDetail item={item("se-dup-shwapno")} original={null} onBack={vi.fn()} onOpen={vi.fn()} onCorrect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Correct or reverse" })).toBeNull();
  });

  it("links a duplicate to its original", () => {
    const onOpen = vi.fn();
    const dup = item("se-dup-shwapno");
    render(<ActivityDetail item={dup} original={findOriginal(items, dup)} onBack={vi.fn()} onOpen={onOpen} onCorrect={vi.fn()} />);
    expect(screen.getByText(/not counted twice/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View the original purchase" }));
    expect(onOpen).toHaveBeenCalledWith("se-amex-shwapno");
  });

  it("sends a needs-answer item to chat", () => {
    render(<ActivityDetail item={item("se-pending-agora")} original={null} onBack={vi.fn()} onOpen={vi.fn()} onCorrect={vi.fn()} />);
    expect(screen.getByText(/not saved yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Answer in Chat" }).getAttribute("href")).toBe("/chat");
  });
});
