import { describe, expect, it, vi } from "vitest";
import { signInWithFallback } from "./sign-in-method";

const authError = (code: string) => Object.assign(new Error(code), { code });

describe("signInWithFallback (release blocker A6)", () => {
  it("an installed app goes straight to redirect, since pop-ups often fail there", async () => {
    const popup = vi.fn(() => Promise.resolve());
    const redirect = vi.fn(() => Promise.resolve());
    await signInWithFallback({ standalone: true, popup, redirect });
    expect(popup).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("in a browser tab it uses the pop-up", async () => {
    const popup = vi.fn(() => Promise.resolve());
    const redirect = vi.fn(() => Promise.resolve());
    await signInWithFallback({ standalone: false, popup, redirect });
    expect(popup).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"])("falls back to redirect when the pop-up fails with %s", async (code) => {
    const redirect = vi.fn(() => Promise.resolve());
    await signInWithFallback({ standalone: false, popup: () => Promise.reject(authError(code)), redirect });
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("a pop-up the user closed is not retried as a redirect", async () => {
    const redirect = vi.fn(() => Promise.resolve());
    await expect(signInWithFallback({ standalone: false, popup: () => Promise.reject(authError("auth/popup-closed-by-user")), redirect })).rejects.toThrow("auth/popup-closed-by-user");
    expect(redirect).not.toHaveBeenCalled();
  });
});
