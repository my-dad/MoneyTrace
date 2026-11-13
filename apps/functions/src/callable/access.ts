/**
 * Who may call MoneyTrace's functions. CR-009: anyone with a verified Google account; each person
 * only ever reaches their own data. The emulator is open so tests can sign in many users.
 */
export type AccessPolicy = { kind: "emulator" } | { kind: "verifiedGoogle" };

export function accessPolicyFromEnv(env: Readonly<Record<string, string | undefined>>): AccessPolicy {
  return env["FUNCTIONS_EMULATOR"] === "true" ? { kind: "emulator" } : { kind: "verifiedGoogle" };
}

/** A signed-in caller as any transport proves it (a Supabase Auth token). */
export type Caller = {
  uid: string;
  email?: string | undefined;
  emailVerified: boolean;
  provider: "google" | "other";
};

export function isAllowed(policy: AccessPolicy, caller: Caller): boolean {
  if (policy.kind === "emulator") return true;
  return (
    caller.provider === "google" &&
    caller.emailVerified &&
    caller.email !== undefined &&
    caller.email !== ""
  );
}
