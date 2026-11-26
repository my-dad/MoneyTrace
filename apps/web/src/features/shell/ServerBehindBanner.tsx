"use client";

import { useEffect, useState } from "react";
import { COPY } from "../../shared/copy";
import styles from "./shell.module.css";

const EVENT = "moneytrace:server-behind";

/** Raised by the API client when `/api` doesn't know a command: this app was deployed before it. */
export function noteServerBehind(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** Once a command has met an older server, says so for the rest of the visit; a reload clears it. */
export function ServerBehindBanner() {
  const [behind, setBehind] = useState(false);
  useEffect(() => {
    const mark = () => { setBehind(true); };
    window.addEventListener(EVENT, mark);
    return () => { window.removeEventListener(EVENT, mark); };
  }, []);
  if (!behind) return null;
  return <p role="alert" className={styles.banner}>{COPY.serverBehind}</p>;
}
