"use client";

import { useMemo } from "react";
import { AuthGate } from "../features/auth/AuthGate";
import { createFirebaseAuthGateway } from "../features/auth/firebase-auth-gateway";

export default function HomePage() {
  const gateway = useMemo(() => createFirebaseAuthGateway(), []);

  return (
    <AuthGate gateway={gateway}>
      <main>
        <p>Signed in</p>
        <button type="button" onClick={() => void gateway.signOut()}>
          Sign out
        </button>
      </main>
    </AuthGate>
  );
}
