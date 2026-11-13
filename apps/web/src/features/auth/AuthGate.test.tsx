/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import axe from "axe-core";
import { afterEach, expect, it } from "vitest";
import { AuthGate } from "./AuthGate";
import type { AuthGateway, AuthUser } from "./auth-gateway";

class FakeAuthGateway implements AuthGateway {
  user: AuthUser | null = null;
  bootstrapCalls = 0;
  signInCalls = 0;
  bootstrapResult: Promise<void> = Promise.resolve();
  signInResult: Promise<void> = Promise.resolve();
  signInShouldFail = false;
  signInError: unknown = new Error("popup closed");
  private listener: ((user: AuthUser | null) => void) | null = null;

  onChange(listener: (user: AuthUser | null) => void): () => void {
    this.listener = listener;
    listener(this.user);
    return () => {
      this.listener = null;
    };
  }

  async signIn(): Promise<void> {
    this.signInCalls += 1;
    if (this.signInShouldFail) throw this.signInError;
    await this.signInResult;
    this.user = { uid: "alice" };
    this.listener?.(this.user);
  }

  async signOut(): Promise<void> {
    this.user = null;
    this.listener?.(null);
    await Promise.resolve();
  }

  emit(user: AuthUser | null): void {
    this.user = user;
    this.listener?.(user);
  }

  async bootstrap(): Promise<void> {
    this.bootstrapCalls += 1;
    await this.bootstrapResult;
  }
}

afterEach(() => {
  cleanup();
});

function renderGate(gateway: FakeAuthGateway, children: ReactNode = <p>private app</p>) {
  return render(<AuthGate gateway={gateway}>{children}</AuthGate>);
}

it("shows a keyboard-reachable sign-in button when signed out", async () => {
  const gateway = new FakeAuthGateway();

  renderGate(gateway);

  const button = await screen.findByRole("button", { name: /sign in with google/i });
  expect(button.tabIndex).toBeGreaterThanOrEqual(0);
  expect(screen.queryByText("private app")).toBeNull();
});

it("tells people before sign-in where their data goes and that they can delete it (CR-009)", async () => {
  renderGate(new FakeAuthGateway());
  await screen.findByRole("button", { name: /sign in with google/i });
  expect(screen.getByText(/stored in your own private account, which only you can see/)).toBeTruthy();
  expect(screen.getByText(/sent to DeepSeek, an AI service/)).toBeTruthy();
  expect(screen.getByText(/delete your account and everything in it at any time from the menu/)).toBeTruthy();
});

it("shows setting up account while bootstrap runs, not the app", async () => {
  const gateway = new FakeAuthGateway();
  let resolveBootstrap!: () => void;
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = new Promise<void>((resolve) => {
    resolveBootstrap = resolve;
  });

  renderGate(gateway);

  expect(await screen.findByText("Setting up your account")).toBeTruthy();
  expect(screen.queryByText("private app")).toBeNull();
  expect(gateway.bootstrapCalls).toBe(1);

  act(() => {
    resolveBootstrap();
  });
});

it("shows children only after bootstrap succeeds", async () => {
  const gateway = new FakeAuthGateway();
  gateway.user = { uid: "alice" };

  renderGate(gateway);

  expect(await screen.findByText("private app")).toBeTruthy();
});

it("does not show the app when sign-out wins a pending bootstrap", async () => {
  const gateway = new FakeAuthGateway();
  let resolveBootstrap!: () => void;
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = new Promise<void>((resolve) => {
    resolveBootstrap = resolve;
  });

  renderGate(gateway);
  expect(await screen.findByText("Setting up your account")).toBeTruthy();

  await gateway.signOut();
  act(() => {
    resolveBootstrap();
  });

  expect(await screen.findByRole("button", { name: /sign in with google/i })).toBeTruthy();
  expect(screen.queryByText("private app")).toBeNull();
});

it("shows a failure message with retry when bootstrap fails, and never the app", async () => {
  const gateway = new FakeAuthGateway();
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = Promise.reject(new Error("bootstrap failed"));

  renderGate(gateway);

  expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't set up your account/i);
  expect(screen.queryByText("private app")).toBeNull();

  gateway.bootstrapResult = Promise.resolve();
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));

  await waitFor(() => {
    expect(gateway.bootstrapCalls).toBe(2);
  });
  expect(await screen.findByText("private app")).toBeTruthy();
});

it("shows a failure message when sign-in is rejected", async () => {
  const gateway = new FakeAuthGateway();
  gateway.signInShouldFail = true;

  renderGate(gateway);
  fireEvent.click(await screen.findByRole("button", { name: /sign in with google/i }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/sign-in failed/i);
  expect(gateway.signInCalls).toBe(1);
});

function pending() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

it("does not show the app when sign-out happens during a retry", async () => {
  const gateway = new FakeAuthGateway();
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = Promise.reject(new Error("bootstrap failed"));
  renderGate(gateway);
  await screen.findByRole("alert");

  const retry = pending();
  gateway.bootstrapResult = retry.promise;
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  act(() => { gateway.emit(null); });
  await act(async () => { retry.resolve(); await retry.promise; });

  expect(screen.getByRole("button", { name: /sign in with google/i })).toBeTruthy();
  expect(screen.queryByText("private app")).toBeNull();
});

it("does not mark a new user ready when an earlier user's retry finishes", async () => {
  const gateway = new FakeAuthGateway();
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = Promise.reject(new Error("bootstrap failed"));
  renderGate(gateway);
  await screen.findByRole("alert");

  const aliceRetry = pending();
  gateway.bootstrapResult = aliceRetry.promise;
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  const bobBootstrap = pending();
  gateway.bootstrapResult = bobBootstrap.promise;
  act(() => { gateway.emit({ uid: "bob" }); });
  await act(async () => { aliceRetry.resolve(); await aliceRetry.promise; });

  expect(screen.getByText("Setting up your account")).toBeTruthy();
  expect(screen.queryByText("private app")).toBeNull();
});

it("the sign-in page has a heading, the line and the button", async () => {
  renderGate(new FakeAuthGateway());
  expect(await screen.findByRole("heading", { level: 1, name: "MoneyTrace" })).toBeTruthy();
  expect(screen.getByText("Paste your bank SMS or tell it about cash. It works out where your money goes.")).toBeTruthy();
  expect(screen.getByRole("main").contains(screen.getByRole("button", { name: "Sign in with Google" }))).toBe(true);
});

it("progress text is announced", async () => {
  const gateway = new FakeAuthGateway();
  gateway.user = { uid: "alice" };
  gateway.bootstrapResult = new Promise<void>(() => undefined);
  renderGate(gateway);
  expect((await screen.findByRole("status")).textContent).toBe("Setting up your account");
});

it("the sign-in button is disabled while a sign-in is in flight", async () => {
  const gateway = new FakeAuthGateway();
  gateway.signInResult = new Promise<void>(() => undefined);
  renderGate(gateway);
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with Google" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
  expect(gateway.signInCalls).toBe(1);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Sign in with Google" }).disabled).toBe(true);
});

it("closing the pop-up shows no error", async () => {
  const gateway = new FakeAuthGateway();
  gateway.signInShouldFail = true;
  gateway.signInError = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
  renderGate(gateway);
  fireEvent.click(await screen.findByRole("button", { name: "Sign in with Google" }));
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>("button", { name: "Sign in with Google" }).disabled).toBe(false); });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("has no axe violations on the sign-in page", async () => {
  const { container } = renderGate(new FakeAuthGateway());
  await screen.findByRole("button", { name: "Sign in with Google" });
  expect((await axe.run(container)).violations).toEqual([]);
});
