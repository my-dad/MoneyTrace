/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureReportSource } from "./fixture-report-source";
import type { ReportSource } from "./report-source";
import { ReportsScreen } from "./ReportsScreen";

afterEach(cleanup);

describe("ReportsScreen", () => {
  it("shows the current month with income, spending, trend and categories", async () => {
    render(<ReportsScreen source={createFixtureReportSource()} />);
    expect(await screen.findByText("৳18,640")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(screen.getByText("৳85,000")).toBeTruthy();
    expect(screen.getByText("৳1,740 more spent than the same days of October (৳16,900).")).toBeTruthy();
    const categories = screen.getByRole("region", { name: "Where it went" });
    expect(within(categories).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Groceries৳6,820",
      "Other৳5,730",
      "Transport৳3,150",
      "Eating out৳2,940",
    ]);
    expect(screen.getByText("Total owed")).toBeTruthy();
    expect(screen.getByText("Agora Dhanmondi card purchase")).toBeTruthy();
  });

  it("shows unexplained cash on its own neutral line", async () => {
    const { container } = render(<ReportsScreen source={createFixtureReportSource()} />);
    const line = await screen.findByRole("note", { name: "Cash not yet explained" });
    expect(within(line).getByText("৳5,000")).toBeTruthy();
    expect(line.textContent).toContain("not counted as spending");
    expect(container.querySelector("[class*='failed'], [class*='danger']")).toBeNull();
  });

  it("switches between month and salary cycle", async () => {
    render(<ReportsScreen source={createFixtureReportSource()} />);
    await screen.findByText("৳18,640");
    fireEvent.click(screen.getByRole("button", { name: "Salary cycle" }));
    expect(await screen.findByText("৳24,915")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "25 Oct – 24 Nov" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salary cycle" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("steps to the previous period", async () => {
    render(<ReportsScreen source={createFixtureReportSource()} />);
    await screen.findByText("৳18,640");
    expect(screen.getByRole("button", { name: "Next period" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(await screen.findByText("৳52,300")).toBeTruthy();
    expect(screen.getByText("No earlier period to compare with. Tracking started on 1 Oct.")).toBeTruthy();
  });

  it("shows the empty state for a null period", async () => {
    render(<ReportsScreen source={createFixtureReportSource()} />);
    await screen.findByText("৳18,640");
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    await screen.findByText("৳52,300");
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(await screen.findByText("Nothing recorded in September 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous period" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Go to a later period" }));
    expect(await screen.findByText("৳52,300")).toBeTruthy();
  });

  it("shows the error state when load rejects", async () => {
    let fail = true;
    const fixture = createFixtureReportSource();
    const source: ReportSource = {
      period: fixture.period,
      load: (kind, offset) => (fail ? Promise.reject(new Error("down")) : fixture.load(kind, offset)),
    };
    render(<ReportsScreen source={source} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this report");
    expect(screen.queryByText(/৳/)).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("৳18,640")).toBeTruthy();
  });

  it("shows loading while a period loads", () => {
    const fixture = createFixtureReportSource();
    render(<ReportsScreen source={{ period: fixture.period, load: () => new Promise(() => undefined) }} />);
    expect(screen.getByRole("status").textContent).toBe("Loading this period…");
  });

  it("shows Not available yet when source is null", () => {
    render(<ReportsScreen source={null} />);
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.queryByText(/৳/)).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ReportsScreen source={createFixtureReportSource()} />);
    await screen.findByText("৳18,640");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
