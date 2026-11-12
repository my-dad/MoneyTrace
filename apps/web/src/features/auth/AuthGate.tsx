"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@moneytrace/ui-kit";
import type { AuthGateway, AuthUser } from "./auth-gateway";
import styles from "./auth.module.css";

/** Closing or replacing the Google pop-up is the user's choice, not a failure. */
const QUIET_SIGN_IN_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);
const codeOf = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

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
  const [signingIn, setSigningIn] = useState(false);
  // Both the first attempt and Retry go through this, so a result only lands for the user still signed in.
  const bootstrapRef = useRef<(user: AuthUser) => Promise<void>>(() => Promise.resolve());

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
    bootstrapRef.current = bootstrap;

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

  if (state.kind === "checking") return <main className={styles.gate}><p role="status">Checking your sign-in status</p></main>;

  if (state.kind === "signedOut") {
    return (
      <main className={styles.gate}>
        <span className={styles.logo} aria-hidden="true">M</span>
        <h1>MoneyTrace</h1>
        <p className={styles.lead}>Paste your bank SMS or tell it about cash. It works out where your money goes.</p>
        {state.error === "signIn" && <p role="alert" className={styles.error}>Sign-in failed. Please try again.</p>}
        <Button
          disabled={signingIn}
          onClick={() => {
            setSigningIn(true);
            gateway
              .signIn()
              .catch((error: unknown) => {
                setState({ kind: "signedOut", ...(QUIET_SIGN_IN_CODES.has(codeOf(error) as string) ? {} : { error: "signIn" as const }) });
              })
              .finally(() => { setSigningIn(false); });
          }}
        >
          Sign in with Google
        </Button>
        <p className={styles.fine}>Never asks for bank passwords, PINs or one-time codes.</p>
      </main>
    );
  }

  if (state.kind === "bootstrapping") return <main className={styles.gate}><p role="status">Setting up your account</p></main>;

  if (state.kind === "bootstrapFailed") {
    return (
      <main className={styles.gate}>
        <p role="alert">Couldn&apos;t set up your account. Please try again.</p>
        <button
          type="button"
          onClick={() => {
            void bootstrapRef.current(state.user);
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  return <AuthUserContext.Provider value={state.user}>{children}</AuthUserContext.Provider>;
}
