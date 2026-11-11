/** Fixture mode skips sign-in, so it may only ever run against a local demo project. */
export function assertFixtureModeAllowed(env: Record<string, string | undefined>): void {
  if (env.NEXT_PUBLIC_DATA_SOURCE !== "fixture") return;
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-moneytrace";
  if (!projectId.startsWith("demo-")) {
    throw new Error("Fixture mode requires a demo- Firebase project");
  }
}
