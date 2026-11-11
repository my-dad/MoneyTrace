/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COPY } from "../../shared/copy";
import { ActionStatus } from "./ActionStatus";

afterEach(cleanup);

describe("ActionStatus", () => {
  it("shows the demo-unavailable text when unavailable", () => {
    render(<ActionStatus busy={false} failed unavailable />);
    expect(screen.getByRole("status").textContent).toBe(
      "Not available yet — demo · nothing was saved",
    );
  });

  it("shows the failed text when failed", () => {
    render(<ActionStatus busy={false} failed unavailable={false} />);
    expect(screen.getByRole("status").textContent).toBe(COPY.failed);
  });

  it("shows nothing when idle", () => {
    const { container } = render(<ActionStatus busy={false} failed={false} unavailable={false} />);
    expect(container.textContent).toBe("");
  });

  it("never says Recorded or Saved", () => {
    const { container } = render(<ActionStatus busy={false} failed unavailable />);
    expect(container.textContent).not.toMatch(/Recorded|Saved/);
  });
});
