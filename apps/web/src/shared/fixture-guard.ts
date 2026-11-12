/** Fixture and emulator builds may only ever run against a local demo project. */
export function assertFixtureModeAllowed(env: Record<string, string | undefined>): void {
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-moneytrace";
  if (projectId.startsWith("demo-")) return;
  // Fixture mode skips sign-in entirely.
  if (env.NEXT_PUBLIC_DATA_SOURCE === "fixture") throw new Error("Fixture mode requires a demo- Firebase project");
  // Emulator mode points the client at 127.0.0.1 and signs in anonymously.
  if (env.NEXT_PUBLIC_USE_EMULATORS === "1") throw new Error("Emulator mode requires a demo- Firebase project");
}
