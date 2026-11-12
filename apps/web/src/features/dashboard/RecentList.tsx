import { formatBdt } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { RecentItem } from "./recent-items";
import styles from "./dashboard.module.css";

export function RecentList({ items }: { items: RecentItem[] }) {
  return (
    <section aria-labelledby="recent" className={styles.card}>
      <h3 id="recent">{DASHBOARD_COPY.recent}</h3>
      <ul className={styles.recent}>
        {items.map((item) => (
          <li key={item.id}>
            <span className={styles.recentText}>
              <span className={styles.recentTitle}>{item.title}</span>
              <span className={styles.recentDetail}>{item.detail}</span>
              <span className={`${styles.status ?? ""} ${styles[item.status] ?? ""}`}>{item.statusLabel}</span>
            </span>
            <b>{item.amountMinor === null ? "—" : formatBdt(item.amountMinor)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
