"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { AppServicesProvider, createAppServices, type AppServices } from "../../shared/app-services";
import { AuthGate } from "../auth/AuthGate";
import { DemoMarker } from "./DemoMarker";
import { OfflineBanner } from "./OfflineBanner";

export function AppShell({ children, services }: { children: ReactNode; services?: AppServices }) {
  const resolved = useMemo(() => services ?? createAppServices(), [services]);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);
  return (
    <AppServicesProvider services={resolved}>
      <OfflineBanner />
      {resolved.fixture && <DemoMarker />}
      <AuthGate gateway={resolved.auth}>{children}</AuthGate>
    </AppServicesProvider>
  );
}
