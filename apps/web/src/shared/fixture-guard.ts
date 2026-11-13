const isLocal = (url: string | undefined) => url !== undefined && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);

/**
 * The demo (fixture mode, which skips sign-in) and local sign-in (anonymous, for the end-to-end
 * suite) may only ever run against a local Supabase (CR-010). Checked when the web app is built.
 */
export function assertFixtureModeAllowed(env: Record<string, string | undefined>): void {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (env.NEXT_PUBLIC_DATA_SOURCE === "fixture" && url !== undefined && url !== "" && !isLocal(url)) {
    throw new Error("Fixture mode needs a local Supabase (or none)");
  }
  if (env.NEXT_PUBLIC_LOCAL_SIGN_IN === "1" && !isLocal(url)) throw new Error("Local sign-in needs a local Supabase");
}
