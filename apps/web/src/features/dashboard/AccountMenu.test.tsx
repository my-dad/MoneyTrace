/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

afterEach(cleanup);

const openMenu = (onDeleteAccount = vi.fn<(confirmation: string) => Promise<void>>(() => Promise.resolve())) => {
  const view = render(<AccountMenu aiSpend="$0.10 used this month" onSignOut={() => Promise.resolve()} onDeleteAccount={onDeleteAccount} />);
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
  return { ...view, onDeleteAccount };
};

describe("Delete my account (CR-009)", () => {
  it("explains what goes and stays locked until the phrase is typed exactly", () => {
    openMenu();
    expect(screen.getByText(/permanently deletes your accounts, messages, transactions and questions/)).toBeTruthy();
    const confirm = screen.getByRole<HTMLButtonElement>("button", { name: "Delete everything" });
    const input = screen.getByLabelText("Type DELETE MY ACCOUNT to confirm");
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "delete my account" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    expect(confirm.disabled).toBe(false);
  });

  it("sends the typed phrase", async () => {
    const { onDeleteAccount } = openMenu();
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT to confirm"), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    await vi.waitFor(() => {
      expect(onDeleteAccount).toHaveBeenCalledWith("DELETE MY ACCOUNT");
    });
  });

  it("says plainly when deletion failed", async () => {
    openMenu(vi.fn(() => Promise.reject(new Error("internal"))));
    fireEvent.change(screen.getByLabelText("Type DELETE MY ACCOUNT to confirm"), { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByText("Your account was not deleted. Please try again.")).toBeTruthy();
  });

  it("can be cancelled", () => {
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Delete everything" })).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = openMenu();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
