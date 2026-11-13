import { describe, expect, it } from "vitest";
import { accessPolicyFromEnv, callerFromFirebase, isAllowed as allowedFor, type AccessPolicy, type VerifiedToken } from "./access";

const isAllowed = (policy: AccessPolicy, token: VerifiedToken) => allowedFor(policy, callerFromFirebase("u", token));
const google = (email: string, verified = true) => ({ email, email_verified: verified, firebase: { sign_in_provider: "google.com" } });
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
    expect(isAllowed(deployed, { email_verified: true, firebase: { sign_in_provider: "google.com" } })).toBe(false);
  });

  it.each(["anonymous", "password", "custom", undefined])("refuses sign-in provider %s", (provider) => {
    expect(isAllowed(deployed, { email: "owner@example.com", email_verified: true, firebase: { sign_in_provider: provider } })).toBe(false);
  });

  it("the emulator is open, so tests can sign in many users", () => {
    expect(isAllowed(accessPolicyFromEnv({ FUNCTIONS_EMULATOR: "true" }), {})).toBe(true);
  });
});
