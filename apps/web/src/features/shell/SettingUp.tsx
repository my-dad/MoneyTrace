"use client";

import { useEffect, useState } from "react";
import { PROFILE_COPY, SETTING_UP_QUOTES } from "../../shared/copy";
import styles from "./setting-up.module.css";

const ROTATE_MS = 6000;

/**
 * While a new account is made: coins dropping into a jar, the progress (the only thing announced),
 * and a money quote that changes every few seconds.
 */
export function SettingUp({ random = Math.random }: { random?: () => number }) {
  const count = SETTING_UP_QUOTES.length;
  const [index, setIndex] = useState(() => Math.min(count - 1, Math.floor(random() * count)));
  useEffect(() => {
    const timer = setInterval(() => { setIndex((i) => (i + 1) % count); }, ROTATE_MS);
    return () => { clearInterval(timer); };
  }, [count]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <svg className={styles.art} viewBox="0 0 160 150" aria-hidden="true" focusable="false">
          <ellipse cx="80" cy="138" rx="46" ry="6" className={styles.shadow} />
          <g className={styles.coins}>
            <g className={styles.coin}><circle cx="80" cy="20" r="11" /><text x="80" y="24.5">৳</text></g>
            <g className={styles.coin}><circle cx="80" cy="20" r="11" /><text x="80" y="24.5">৳</text></g>
            <g className={styles.coin}><circle cx="80" cy="20" r="11" /><text x="80" y="24.5">৳</text></g>
          </g>
          <g className={styles.jar}>
            <rect x="50" y="48" width="60" height="10" rx="4" className={styles.lid} />
            <rect x="68" y="51" width="24" height="4" rx="2" className={styles.slot} />
            <path d="M44 66 Q44 58 52 58 H108 Q116 58 116 66 V124 Q116 136 104 136 H56 Q44 136 44 124 Z" className={styles.glass} />
            <path d="M48 108 H112 V124 Q112 132 104 132 H56 Q48 132 48 124 Z" className={styles.fill} />
            <circle cx="64" cy="114" r="6" className={styles.pile} />
            <circle cx="80" cy="116" r="6" className={styles.pile} />
            <circle cx="96" cy="114" r="6" className={styles.pile} />
            <circle cx="72" cy="104" r="6" className={styles.pile} />
            <circle cx="88" cy="104" r="6" className={styles.pile} />
            <path d="M54 70 V96" className={styles.shine} />
          </g>
        </svg>
        <div className={styles.progress}>
          <span className={styles.spinner} aria-hidden="true" />
          <p role="status" className={styles.status}>{PROFILE_COPY.settingUp}</p>
        </div>
        <p key={index} className={styles.quote}>{SETTING_UP_QUOTES[index]}</p>
      </div>
    </main>
  );
}
