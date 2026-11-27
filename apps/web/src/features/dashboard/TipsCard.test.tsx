/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TipsCard } from "./TipsCard";
import type { TipsViewModel } from "./tips-view";

afterEach(cleanup);

const tips: TipsViewModel = {
  kind: "tips",
  items: [
    { id: "sectorUp:food", kind: "sectorUp", sector: "food", headline: "Food is up on last month", detail: "৳2,940 by 6 Nov, against ৳2,130 by this time in October", advice: "A few more home-cooked dinners would bring it back in line." },
    { id: "unsorted", kind: "unsorted", headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" },
    { id: "unexplainedCash", kind: "unexplainedCash", headline: "৳5,000 cash isn't explained yet", detail: "Counting your cash keeps the picture right" },
  ],
  age: "Made today",
  factsOnly: false,
};
const base = { view: tips, busy: false, failed: false, limitReached: false };

describe("TipsCard", () => {
  it("shows each tip's figure, and advice only where there is some", () => {
    render(<TipsCard {...base} />);
    expect(screen.getByRole("region", { name: "Tips to spend less" })).toBeTruthy();
    expect(screen.getByText("Food is up on last month")).toBeTruthy();
    expect(screen.getByText("৳2,940 by 6 Nov, against ৳2,130 by this time in October")).toBeTruthy();
    expect(screen.getByText("A few more home-cooked dinners would bring it back in line.")).toBeTruthy();
    expect(screen.getByText("Made today")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("New tips is a button, and is off while new tips are being made", () => {
    const onNewTips = vi.fn();
    const { rerender } = render(<TipsCard {...base} onNewTips={onNewTips} />);
    fireEvent.click(screen.getByRole("button", { name: "New tips" }));
    expect(onNewTips).toHaveBeenCalledTimes(1);
    rerender(<TipsCard {...base} busy onNewTips={onNewTips} />);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "New tips" }).disabled).toBe(true);
    expect(screen.getByText("Making new tips…")).toBeTruthy();
  });

  it("Sort and Count my cash appear only when they can be done", () => {
    const { rerender } = render(<TipsCard {...base} />);
    expect(screen.queryByRole("button", { name: "Sort" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Count my cash" })).toBeNull();
    const onSort = vi.fn();
    const onCountCash = vi.fn();
    rerender(<TipsCard {...base} onSort={onSort} onCountCash={onCountCash} />);
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    fireEvent.click(screen.getByRole("button", { name: "Count my cash" }));
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onCountCash).toHaveBeenCalledTimes(1);
  });

  it("figures only: says advice is unavailable, except while new tips are being made", () => {
    const { rerender } = render(<TipsCard {...base} view={{ ...tips, factsOnly: true }} />);
    expect(screen.getByText("Advice is unavailable right now; these figures are up to date.")).toBeTruthy();
    rerender(<TipsCard {...base} busy view={{ ...tips, factsOnly: true }} />);
    expect(screen.queryByText("Advice is unavailable right now; these figures are up to date.")).toBeNull();
  });

  it("says honestly when new tips couldn't be made, or today's are used up", () => {
    const { rerender } = render(<TipsCard {...base} failed />);
    expect(screen.getByText("Couldn't make new tips; showing the last ones")).toBeTruthy();
    rerender(<TipsCard {...base} limitReached />);
    expect(screen.getByText("You've had today's fresh tips. More tomorrow.")).toBeTruthy();
  });

  it("a demo New tips says nothing was saved", () => {
    render(<TipsCard {...base} demo />);
    expect(screen.getByText("Not available yet — demo · nothing was saved")).toBeTruthy();
  });

  it("not enough spending yet", () => {
    render(<TipsCard {...base} view={{ kind: "notEnoughData" }} onNewTips={vi.fn()} />);
    expect(screen.getByText("Tips appear once there's a couple of weeks of spending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New tips" })).toBeNull();
  });

  it("nothing stands out", () => {
    render(<TipsCard {...base} view={{ ...tips, items: [] }} />);
    expect(screen.getByText("Nothing stands out so far this month.")).toBeTruthy();
  });

  it("no tips yet: nothing, unless they are being made", () => {
    const { container, rerender } = render(<TipsCard {...base} view={{ kind: "none" }} />);
    expect(container.innerHTML).toBe("");
    rerender(<TipsCard {...base} view={{ kind: "none" }} busy />);
    expect(screen.getByText("Making new tips…")).toBeTruthy();
  });
});
