"use client";

import { useState } from "react";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { useAuthUser } from "../features/auth/AuthGate";
import { useAppServices } from "../shared/app-services";
import { DemoUnavailableError } from "../shared/demo-unavailable";

export default function HomePage() {
  const { readModels, auth, fixture, nowMs } = useAppServices();
  const user = useAuthUser();
  // Read the clock once per visit: a new "now" on every render would resubscribe every figure.
  const [now] = useState(nowMs);
  return (
    <DashboardScreen
      gateway={readModels}
      nowMs={now}
      {...(user?.displayName === undefined ? {} : { displayName: user.displayName })}
      // The demo can't sign out: say so rather than doing nothing.
      onSignOut={fixture ? () => Promise.reject(new DemoUnavailableError()) : () => auth.signOut()}
    />
  );
}
