/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CategoryChart } from "./CategoryChart";

afterEach(cleanup);

it("names spending with no category in plain words", () => {
  render(<CategoryChart rows={[{ category: "uncategorized", amountMinor: 360_000, percent: 100 }]} comparison={null} />);
  expect(screen.getByText("Not sorted yet")).toBeTruthy();
});
