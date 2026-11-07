/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfflineBanner } from "./OfflineBanner";

afterEach(cleanup);

describe("OfflineBanner", () => {
  it("appears when the browser goes offline", () => {
    render(<OfflineBanner />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status").textContent).toContain("offline");
  });
});
