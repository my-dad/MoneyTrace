/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

afterEach(cleanup);

const openMenu = (onDeleteAccount = vi.fn<(confirmation: string) => Promise<void>>(() => Promise.resolve())) => {
  const view = render(<AccountMenu onSignOut={() => Promise.resolve()} onDeleteAccount={onDeleteAccount} />);
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

describe("closing the menu", () => {
  const show = () => {
    render(
      <div>
        <p>Elsewhere on the page</p>
        <AccountMenu onSignOut={() => Promise.resolve()} onDeleteAccount={() => Promise.resolve()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  };

  it("a tap anywhere outside closes it", () => {
    show();
    fireEvent.pointerDown(screen.getByText("Elsewhere on the page"));
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("a tap inside the menu keeps it open", () => {
    show();
    fireEvent.pointerDown(screen.getByText("Your data"));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("Escape closes it and puts focus back on the menu button", () => {
    show();
    fireEvent.keyDown(screen.getByRole("button", { name: "Sign out" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Menu" }));
  });

  it("the menu button still toggles it closed", () => {
    show();
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

describe("Your data", () => {
  it("keeps Delete my account apart from Sign out, under Your data, with the privacy policy", () => {
    render(<AccountMenu onSignOut={() => Promise.resolve()} onDeleteAccount={() => Promise.resolve()} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const group = screen.getByRole("group", { name: "Your data" });
    const policy = within(group).getByRole("link", { name: /Privacy policy/ });
    expect(policy.getAttribute("href")).toBe("https://sites.google.com/view/money-tracer-policy/privacy-policy");
    expect(policy.getAttribute("target")).toBe("_blank");
    expect(policy.getAttribute("rel")).toContain("noopener");
    expect(within(group).getByRole("button", { name: "Delete my account" })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
