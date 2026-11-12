/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureCommands } from "../../shared/fixture-commands";
import { createFixtureSettingsSource } from "./fixture-settings-source";
import type { SettingsSource } from "./settings-source";
import { SettingsScreen, type SettingsSection } from "./SettingsScreen";

afterEach(cleanup);

const renderSettings = (source: SettingsSource | null = createFixtureSettingsSource(), section: SettingsSection | null = null) => {
  const onSection = vi.fn();
  const onSignOut = vi.fn();
  const view = render(<SettingsScreen source={source} commands={createFixtureCommands()} section={section} onSection={onSection} onSignOut={onSignOut} />);
  return { ...view, onSection, onSignOut };
};

describe("SettingsScreen", () => {
  it("shows each section", async () => {
    const { onSection, onSignOut } = renderSettings();
    expect(await screen.findByRole("button", { name: /Reporting period.*Salary cycle · starts on the 25th/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /AI budget.*\$1\.43 of \$5\.00 this month/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reminders.*Daily digest at 9:00 pm/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Notifications.*in-app inbox always on/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Privacy/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Accounts/ }).getAttribute("href")).toBe("/accounts");
    fireEvent.click(screen.getByRole("button", { name: /AI budget/ }));
    expect(onSection).toHaveBeenCalledWith("ai");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("opens a section's detail", async () => {
    renderSettings(createFixtureSettingsSource(), "privacy");
    expect(await screen.findByRole("heading", { name: "What it never asks for" })).toBeTruthy();
    expect(screen.getByText(/One-time codes \(OTPs\)/)).toBeTruthy();
  });

  it("saves the reporting period through updateSettings", async () => {
    renderSettings(createFixtureSettingsSource(), "period");
    fireEvent.click(await screen.findByRole("button", { name: "Save reporting period" }));
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("shows Not available yet when source is null", () => {
    renderSettings(null);
    expect(screen.getByText("Not available yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows loading while settings load", () => {
    renderSettings({ load: () => new Promise(() => undefined) });
    expect(screen.getByRole("status").textContent).toBe("Loading your settings…");
  });

  it("shows an error with Retry when settings can't load", async () => {
    let fail = true;
    const fixture = createFixtureSettingsSource();
    renderSettings({ load: () => (fail ? Promise.reject(new Error("down")) : fixture.load()) });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load your settings");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: /AI budget/ })).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = renderSettings();
    await screen.findByRole("button", { name: /AI budget/ });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
