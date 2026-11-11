import type { AuthGateway } from "./auth-gateway";

/** Demo identity for fixture mode only; the build guard keeps it off real projects. */
export function createFixtureAuthGateway(): AuthGateway {
  return {
    onChange(callback) {
      callback({ uid: "demo-user", displayName: "Demo" });
      return () => undefined;
    },
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    bootstrap: () => Promise.resolve(),
  };
}
