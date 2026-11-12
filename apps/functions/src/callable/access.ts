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

export function isAllowed(policy: AccessPolicy, token: VerifiedToken): boolean {
  if (policy.kind === "emulator") return true;
  return (
    token.firebase?.sign_in_provider === "google.com" &&
    token.email_verified === true &&
    token.email !== undefined &&
    policy.emails.has(token.email.toLowerCase())
  );
}
