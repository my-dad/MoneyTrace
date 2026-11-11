/** Fixture mode is a build-time switch; it is never on unless explicitly set. */
export function isFixtureMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "fixture";
}
