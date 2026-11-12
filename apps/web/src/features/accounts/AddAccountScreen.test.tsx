/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { AddAccountScreen } from "./AddAccountScreen";

afterEach(cleanup);

const created = () => vi.fn(() => Promise.resolve({ accountId: "acc-1" }));
const fill = (name: string, kind?: string) => {
  fireEvent.change(screen.getByLabelText("Account name"), { target: { value: name } });
  if (kind !== undefined) fireEvent.change(screen.getByLabelText("Type"), { target: { value: kind } });
  fireEvent.click(screen.getByRole("button", { name: "Save account" }));
};

describe("AddAccountScreen (CR-006)", () => {
  it("asks only for a name and a type", () => {
    render(<AddAccountScreen commands={{ createAccount: created() }} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByText(/digits|provider|opening balance|card number/i)).toBeNull();
    expect(screen.getByText("Every account starts at ৳0.")).toBeTruthy();
  });

  it("creates the account with its name and type, and confirms it", async () => {
    const createAccount = created();
    render(<AddAccountScreen commands={{ createAccount }} />);
    fill("  City Bank  ", "creditLiability");
    expect((await screen.findByRole("status")).textContent).toBe("City Bank added. It starts at ৳0.");
    expect(createAccount).toHaveBeenCalledWith({ kind: "creditLiability", name: "City Bank", currency: "BDT" });
  });

  it("requires a name", () => {
    const createAccount = created();
    render(<AddAccountScreen commands={{ createAccount }} />);
    fill("   ");
    expect(screen.getByText("Give the account a name.")).toBeTruthy();
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("says a failed save wasn't saved and keeps the form", async () => {
    render(<AddAccountScreen commands={{ createAccount: vi.fn(() => Promise.reject(new Error("down"))) }} />);
    fill("Wallet", "cash");
    expect((await screen.findByRole("alert")).textContent).toBe("That wasn't saved. Please try again.");
    expect(screen.getByLabelText<HTMLInputElement>("Account name").value).toBe("Wallet");
  });

  it("says a demo save was not saved", async () => {
    render(<AddAccountScreen commands={{ createAccount: vi.fn(() => Promise.reject(new DemoUnavailableError())) }} />);
    fill("Wallet");
    expect((await screen.findByRole("status")).textContent).toBe("Not available yet — demo · nothing was saved");
  });

  it("creates one account on a double tap", async () => {
    let resolve!: (value: { accountId: string }) => void;
    const createAccount = vi.fn(() => new Promise<{ accountId: string }>((r) => { resolve = r; }));
    render(<AddAccountScreen commands={{ createAccount }} />);
    fill("Wallet");
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    resolve({ accountId: "a" });
    await waitFor(() => { expect(screen.getByRole("status")).toBeTruthy(); });
    expect(createAccount).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<AddAccountScreen commands={{ createAccount: created() }} />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
