"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { AppServicesProvider, createAppServices, type AppServices } from "../../shared/app-services";
import { AuthGate } from "../auth/AuthGate";
import { AppNav } from "./AppNav";
import { DemoMarker } from "./DemoMarker";
import { OfflineBanner } from "./OfflineBanner";
import styles from "./shell.module.css";

export function AppShell({ children, services }: { children: ReactNode; services?: AppServices }) {
  const resolved = useMemo(() => services ?? createAppServices(), [services]);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);
  return (
    <AppServicesProvider services={resolved}>
      {resolved.fixture && <DemoMarker />}
      <OfflineBanner />
      <AuthGate gateway={resolved.auth}>
        <div className={`${styles.frame ?? ""} ${resolved.fixture ? (styles.withDemo ?? "") : ""}`}>
          <AppNav />
          <div className={styles.content}>{children}</div>
        </div>
      </AuthGate>
    </AppServicesProvider>
  );
}
