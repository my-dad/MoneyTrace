/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiBudgetView, formatUsdMicros } from "./AiBudgetView";

afterEach(cleanup);

const AI = { spentTodayUsdMicros: 12_000, dailyLimitUsdMicros: 50_000, spentMonthUsdMicros: 1_430_000, monthlyLimitUsdMicros: 5_000_000 };

describe("AiBudgetView", () => {
  it("formats micro-dollars as USD cents, rounded down, using integer math", () => {
    expect(formatUsdMicros(12_000)).toBe("$0.01");
    expect(formatUsdMicros(1_430_000)).toBe("$1.43");
    expect(formatUsdMicros(50_000)).toBe("$0.05");
    expect(formatUsdMicros(19_999)).toBe("$0.01");
    expect(formatUsdMicros(5_000_000)).toBe("$5.00");
  });

  it("shows today and this month against their limits", () => {
    render(<AiBudgetView ai={AI} />);
    expect(screen.getByText("of $0.05 a day")).toBeTruthy();
    expect(screen.getByText("$1.43")).toBeTruthy();
    expect(screen.getByText("of $5.00 a month")).toBeTruthy();
  });

  it("says chat keeps working when the budget is reached", () => {
    render(<AiBudgetView ai={{ ...AI, spentTodayUsdMicros: 50_000 }} />);
    expect(screen.getByText(/Today's AI budget is used up/)).toBeTruthy();
    expect(screen.getByText(/chat and SMS parsing keep working/)).toBeTruthy();
  });
});
