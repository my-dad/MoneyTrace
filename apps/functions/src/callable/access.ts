/** Who may call MoneyTrace's functions. Single-user (CR-003 review): an allowlist, Google only. */
export type AccessPolicy =
  | { kind: "emulator" }
  | { kind: "allowlist"; emails: ReadonlySet<string> };

/** The parts of a verified Firebase ID token this check reads. */
export type VerifiedToken = {
  email?: string | undefined;
  email_verified?: boolean | undefined;
  firebase?: { sign_in_provider?: string | undefined } | undefined;
};

/**
 * The emulator is open so tests can sign in many users. Anywhere else the allowlist comes from the
 * `ALLOWED_EMAILS` secret (comma-separated), and an empty one lets nobody in.
 */
export function accessPolicyFromEnv(env: Readonly<Record<string, string | undefined>>): AccessPolicy {
  if (env["FUNCTIONS_EMULATOR"] === "true") return { kind: "emulator" };
  const emails = (env["ALLOWED_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
  return { kind: "allowlist", emails: new Set(emails) };
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
    policy.emails.has(caller.email.toLowerCase())
  );
}
