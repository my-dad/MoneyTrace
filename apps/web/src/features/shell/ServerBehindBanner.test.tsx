/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COPY } from "../../shared/copy";
import { ServerBehindBanner, noteServerBehind } from "./ServerBehindBanner";

afterEach(cleanup);

describe("ServerBehindBanner", () => {
  it("stays hidden until a command meets an older server", () => {
    const { container } = render(<ServerBehindBanner />);
    expect(container.textContent).toBe("");
  });

  it("says the server is behind the app, and that nothing was saved", () => {
    render(<ServerBehindBanner />);
    act(() => { noteServerBehind(); });
    expect(screen.getByRole("alert").textContent).toBe(COPY.serverBehind);
    expect(COPY.serverBehind).toMatch(/nothing was saved/);
  });
});
