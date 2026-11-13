/**
 * Who may call MoneyTrace's functions. CR-009: anyone with a verified Google account; each person
 * only ever reaches their own data. The emulator is open so tests can sign in many users.
 */
export type AccessPolicy = { kind: "emulator" } | { kind: "verifiedGoogle" };

/** The parts of a verified Firebase ID token this check reads. */
export type VerifiedToken = {
  email?: string | undefined;
  email_verified?: boolean | undefined;
  firebase?: { sign_in_provider?: string | undefined } | undefined;
};

export function accessPolicyFromEnv(env: Readonly<Record<string, string | undefined>>): AccessPolicy {
  return env["FUNCTIONS_EMULATOR"] === "true" ? { kind: "emulator" } : { kind: "verifiedGoogle" };
}

/** A signed-in caller as any transport proves it (Firebase ID token, Supabase JWT). */
export type Caller = {
  uid: string;
  email?: string | undefined;
  emailVerified: boolean;
  provider: "google" | "other";
};

export const callerFromFirebase = (uid: string, token: VerifiedToken = {}): Caller => ({
  uid,
  email: token.email,
  emailVerified: token.email_verified === true,
  provider: token.firebase?.sign_in_provider === "google.com" ? "google" : "other",
});

export function isAllowed(policy: AccessPolicy, caller: Caller): boolean {
  if (policy.kind === "emulator") return true;
  return (
    caller.provider === "google" &&
    caller.emailVerified &&
    caller.email !== undefined &&
    caller.email !== ""
  );
}
