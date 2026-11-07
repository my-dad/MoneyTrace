"use client";

import { useMemo } from "react";
import { AuthGate, useAuthUser } from "../features/auth/AuthGate";
import { createFirebaseAuthGateway } from "../features/auth/firebase-auth-gateway";
import { HomeScreen } from "../features/home/HomeScreen";
import { createFirebaseReadModelGateway } from "../shared/firebase-read-model-gateway";

export default function HomePage() {
  const gateway = useMemo(() => createFirebaseAuthGateway(), []);
  const readModels = useMemo(() => createFirebaseReadModelGateway(), []);

  return (
    <AuthGate gateway={gateway}>
      <HomeData gateway={readModels} />
    </AuthGate>
  );
}

function HomeData({ gateway }: { gateway: ReturnType<typeof createFirebaseReadModelGateway> }) {
  const user = useAuthUser();
  return (
    <HomeScreen
      gateway={gateway}
      {...(user?.displayName === undefined ? {} : { displayName: user.displayName })}
      onAddAccount={() => {
        window.location.href = "/accounts";
      }}
    />
  );
}
