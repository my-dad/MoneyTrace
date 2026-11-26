/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTING_UP_QUOTES } from "../../shared/copy";
import { SettingUp } from "./SettingUp";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SettingUp", () => {
  it("announces only the progress, not the quote", () => {
    render(<SettingUp random={() => 0} />);
    expect(screen.getByRole("status").textContent).toBe("Setting up your account");
  });

  it("shows a quote picked at random", () => {
    render(<SettingUp random={() => 0.999} />);
    const last = SETTING_UP_QUOTES[SETTING_UP_QUOTES.length - 1];
    expect(screen.getByText(last ?? "")).toBeTruthy();
  });

  it("moves on to another quote while it waits", () => {
    vi.useFakeTimers();
    render(<SettingUp random={() => 0} />);
    expect(screen.getByText(SETTING_UP_QUOTES[0])).toBeTruthy();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText(SETTING_UP_QUOTES[1])).toBeTruthy();
  });

  it("keeps the illustration out of the accessibility tree", () => {
    const { container } = render(<SettingUp random={() => 0} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
