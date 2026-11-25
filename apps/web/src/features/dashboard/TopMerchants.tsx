import { SECTOR_LABELS, formatBdt } from "@moneytrace/contracts";
import type { CSSProperties } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { MerchantRow } from "./dashboard-view-model";
import type { Sortable } from "./RecentList";
import styles from "./dashboard.module.css";
import charts from "./charts.module.css";

/** The shops taking the most this month; a named shop can be sorted into a sector. */
export function TopMerchants({ rows, onSort }: { rows: MerchantRow[]; onSort?: (shop: Sortable) => void }) {
  const max = rows[0]?.amountMinor ?? 0;
  return (
    <section aria-labelledby="top-shops" className={styles.card}>
      <h3 id="top-shops">{DASHBOARD_COPY.topShops}</h3>
      {rows.length === 0 ? (
        <p className={charts.empty}>{DASHBOARD_COPY.noSpendingYet}</p>
      ) : (
        <ul className={charts.shops}>
          {rows.map((row) => (
            <li key={row.key === "" ? "-" : row.key} style={{ "--sector": `var(--mt-sector-${row.sector})`, "--share": `${String(max === 0 ? 0 : (row.amountMinor * 100) / max)}%` } as CSSProperties}>
              <span className={charts.shopText}>
                <span className={charts.shopName}>{row.name}</span>
                <small className={charts.shopSector}>{SECTOR_LABELS[row.sector]}</small>
              </span>
              <b>{formatBdt(row.amountMinor)}</b>
              {onSort !== undefined && row.key !== "" && (
                <button type="button" className={styles.sortButton} aria-label={DASHBOARD_COPY.sortAria(row.name)} onClick={() => { onSort({ key: row.key, name: row.name }); }}>
                  {DASHBOARD_COPY.sort}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
