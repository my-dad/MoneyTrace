import { describe, expect, it } from "vitest";
import { accessPolicyFromEnv, isAllowed, type Caller } from "./access";

const google = (email: string, verified = true): Caller => ({ uid: "u", email, emailVerified: verified, provider: "google" });
const deployed = accessPolicyFromEnv({});

describe("access policy (CR-009: open sign-up)", () => {
  it("lets in any verified Google account", () => {
    expect(isAllowed(deployed, google("owner@example.com"))).toBe(true);
    expect(isAllowed(deployed, google("friend@example.org"))).toBe(true);
  });

  it("ignores a leftover ALLOWED_EMAILS: the allowlist is gone", () => {
    expect(isAllowed(accessPolicyFromEnv({ ALLOWED_EMAILS: "owner@example.com" }), google("friend@example.org"))).toBe(true);
  });

  it("refuses an unverified email", () => {
    expect(isAllowed(deployed, google("owner@example.com", false))).toBe(false);
  });

  it("refuses a Google sign-in without an email", () => {
    expect(isAllowed(deployed, { uid: "u", emailVerified: true, provider: "google" })).toBe(false);
    expect(isAllowed(deployed, google(""))).toBe(false);
  });

  it("refuses any other sign-in (anonymous, password)", () => {
    expect(isAllowed(deployed, { ...google("owner@example.com"), provider: "other" })).toBe(false);
  });

  it("local test stacks are open, so tests can sign in many users", () => {
    expect(isAllowed(accessPolicyFromEnv({ FUNCTIONS_EMULATOR: "true" }), { uid: "u", emailVerified: false, provider: "other" })).toBe(true);
  });
});
