import { formatBdt } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { RecentItem } from "./recent-items";
import styles from "./dashboard.module.css";

export type Sortable = { key: string; name: string };

/** `sortOf` names the shop of a spend still Not sorted yet, so the row offers to sort it. */
export function RecentList({
  items,
  sortOf,
  onSort,
}: {
  items: RecentItem[];
  sortOf?: (item: RecentItem) => Sortable | null;
  onSort?: (shop: Sortable) => void;
}) {
  return (
    <section aria-labelledby="recent" className={styles.card}>
      <h3 id="recent">{DASHBOARD_COPY.recent}</h3>
      <ul className={styles.recent}>
        {items.map((item) => (
          <li key={item.id}>
            <span className={`${styles.recentIcon ?? ""} ${styles[`icon_${item.status}`] ?? ""}`} aria-hidden="true" data-letter={item.title.trim().charAt(0).toUpperCase() || "৳"} />
            <span className={styles.recentText}>
              <span className={styles.recentTitle}>{item.title}</span>
              <span className={styles.recentDetail}>{item.detail}</span>
              {item.chips.length > 0 && (
                <span className={styles.chips}>
                  {item.chips.map((chip, index) => (
                    <span key={`${chip}-${String(index)}`} className={`${styles.chip ?? ""} ${index === 0 && item.chips[0] === "Transfer" ? (styles.transferChip ?? "") : ""}`}>{chip}</span>
                  ))}
                </span>
              )}
              {onSort !== undefined &&
                (() => {
                  const shop = sortOf?.(item) ?? null;
                  return shop === null ? null : (
                    <button type="button" className={styles.sortButton} aria-label={DASHBOARD_COPY.sortAria(shop.name)} onClick={() => { onSort(shop); }}>
                      {DASHBOARD_COPY.sort}
                    </button>
                  );
                })()}
              {/* Recorded is the normal case; only what needs attention is marked. */}
              {item.status !== "recorded" && (
                <span className={`${styles.status ?? ""} ${styles[item.status] ?? ""}`}>{item.statusLabel}</span>
              )}
            </span>
            <b>{item.amountMinor === null ? "—" : formatBdt(item.amountMinor)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
