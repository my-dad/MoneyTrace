"use client";

import { useEffect, useState } from "react";
import styles from "./shell.module.css";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const markOnline = () => {
      setOnline(true);
    };
    const markOffline = () => {
      setOnline(false);
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return <p role="status" className={styles.banner}>You&apos;re offline. Sending is disabled until you reconnect.</p>;
}
