/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { NavBar } from "./NavBar";

afterEach(cleanup);

const mainLinks = () => within(screen.getByRole("list", { name: "Destinations" })).getAllByRole("link");

describe("NavBar", () => {
  it("renders the five tabs in order", () => {
    render(<NavBar pathname="/" openReminders={0} />);
    expect(mainLinks().map((link) => link.textContent)).toEqual(["Home", "Chat", "Activity", "Accounts", "Reports"]);
    expect(mainLinks().map((link) => link.getAttribute("href"))).toEqual(["/", "/chat", "/activity", "/accounts", "/reports"]);
  });

  it("marks the current tab with aria-current", () => {
    render(<NavBar pathname="/reports" openReminders={0} />);
    const current = mainLinks().filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Reports"]);
  });

  it("matches nested accounts paths", () => {
    render(<NavBar pathname="/accounts/new" openReminders={0} />);
    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("offers reminders with the open count and settings in the rail", () => {
    render(<NavBar pathname="/" openReminders={2} />);
    expect(screen.getByRole("link", { name: "Reminders, 2 open" }).getAttribute("href")).toBe("/reminders");
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });

  it("has no axe violations", async () => {
    const { container } = render(<NavBar pathname="/" openReminders={2} />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
