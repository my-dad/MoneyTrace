"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthGateway, AuthUser } from "./auth-gateway";

type GateState =
  | { kind: "checking" }
  | { kind: "signedOut"; error?: "signIn" }
  | { kind: "bootstrapping"; user: AuthUser }
  | { kind: "ready"; user: AuthUser }
  | { kind: "bootstrapFailed"; user: AuthUser };

const AuthUserContext = createContext<AuthUser | null>(null);

export function useAuthUser(): AuthUser | null {
  return useContext(AuthUserContext);
}

export function AuthGate({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  useEffect(() => {
    let disposed = false;
    let activeUser: AuthUser | null = null;

    const bootstrap = async (user: AuthUser) => {
      setState({ kind: "bootstrapping", user });
      try {
        await gateway.bootstrap();
        if (!disposed && activeUser?.uid === user.uid) setState({ kind: "ready", user });
      } catch {
        if (!disposed && activeUser?.uid === user.uid) {
          setState({ kind: "bootstrapFailed", user });
        }
      }
    };

    const unsubscribe = gateway.onChange((user) => {
      if (disposed) return;
      activeUser = user;
      if (user === null) {
        setState({ kind: "signedOut" });
        return;
      }
      void bootstrap(user);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [gateway]);

  if (state.kind === "checking") return <p>Checking your sign-in status</p>;

  if (state.kind === "signedOut") {
    return (
      <main>
        {state.error === "signIn" && <p role="alert">Sign-in failed. Please try again.</p>}
        <button
          type="button"
          onClick={() => {
            void gateway.signIn().catch(() => {
              setState({ kind: "signedOut", error: "signIn" });
            });
          }}
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (state.kind === "bootstrapping") return <p>Setting up your account</p>;

  if (state.kind === "bootstrapFailed") {
    return (
      <main>
        <p role="alert">Couldn&apos;t set up your account. Please try again.</p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: "bootstrapping", user: state.user });
            void gateway.bootstrap().then(
              () => {
                setState({ kind: "ready", user: state.user });
              },
              () => {
                setState({ kind: "bootstrapFailed", user: state.user });
              },
            );
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  return <AuthUserContext.Provider value={state.user}>{children}</AuthUserContext.Provider>;
}
