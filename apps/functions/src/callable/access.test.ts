import { describe, expect, it } from "vitest";
import { accessPolicyFromEnv, callerFromFirebase, isAllowed as allowedFor, type AccessPolicy, type VerifiedToken } from "./access";

const isAllowed = (policy: AccessPolicy, token: VerifiedToken) => allowedFor(policy, callerFromFirebase("u", token));

const google = (email: string, verified = true) => ({ email, email_verified: verified, firebase: { sign_in_provider: "google.com" } });
const deployed = accessPolicyFromEnv({ ALLOWED_EMAILS: " Owner@Example.com , second@example.com " });

describe("access policy", () => {
  it("lets in a verified Google account on the allowlist, ignoring case and spaces", () => {
    expect(isAllowed(deployed, google("owner@example.com"))).toBe(true);
    expect(isAllowed(deployed, google("SECOND@example.com"))).toBe(true);
  });

  it("refuses any other Google account", () => {
    expect(isAllowed(deployed, google("stranger@example.com"))).toBe(false);
  });

  it("refuses an unverified email, even on the allowlist", () => {
    expect(isAllowed(deployed, google("owner@example.com", false))).toBe(false);
  });

  it.each(["anonymous", "password", "custom", undefined])("refuses sign-in provider %s", (provider) => {
    expect(isAllowed(deployed, { email: "owner@example.com", email_verified: true, firebase: { sign_in_provider: provider } })).toBe(false);
  });

  it("fails closed: a deployment with no allowlist lets nobody in", () => {
    expect(isAllowed(accessPolicyFromEnv({}), google("owner@example.com"))).toBe(false);
    expect(isAllowed(accessPolicyFromEnv({ ALLOWED_EMAILS: " , " }), google("owner@example.com"))).toBe(false);
  });

  it("the emulator is open, so tests can sign in many users", () => {
    expect(isAllowed(accessPolicyFromEnv({ FUNCTIONS_EMULATOR: "true" }), {})).toBe(true);
  });
});
