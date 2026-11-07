"use client";

import { useEffect, type ReactNode } from "react";
import { OfflineBanner } from "./OfflineBanner";

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);
  return <><OfflineBanner />{children}</>;
}
