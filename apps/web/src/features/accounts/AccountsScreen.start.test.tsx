/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountsScreen } from "./AccountsScreen";

afterEach(cleanup);

it("opens straight on the add form at /accounts/new", () => {
  const commands = { createAccount: vi.fn(), createPaymentInstrument: vi.fn(), recordOpeningBalance: vi.fn() };
  render(<AccountsScreen accounts={[]} commands={commands} startAdding />);
  expect(screen.getByRole("heading", { name: "Add account" })).toBeTruthy();
  expect(screen.getByLabelText("Account name")).toBeTruthy();
});
