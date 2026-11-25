import type { CSSProperties } from "react";
import { SECTOR_LABELS, formatBdt, type SectorId } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { CategoryRow } from "./dashboard-view-model";
import styles from "./dashboard.module.css";

/** Each sector keeps its own colour on every chart; money not sorted yet stays grey. */
const colorOf = (category: SectorId): string => `var(--mt-sector-${category})`;

const nameOf = (category: SectorId): string => SECTOR_LABELS[category];

export function CategoryChart({ rows, comparison }: { rows: CategoryRow[]; comparison: string | null }) {
  return (
    <section aria-labelledby="where-it-went" className={styles.card}>
      <h3 id="where-it-went">{DASHBOARD_COPY.whereItWent}</h3>
      <ul className={styles.bars}>
        {rows.map((row, index) => (
          <li key={row.category} style={{ "--bar": colorOf(row.category), "--delay": `${String(index * 60)}ms` } as CSSProperties}>
            <div className={styles.barLabel}><span><i className={styles.dot} aria-hidden="true" />{nameOf(row.category)}</span><b>{formatBdt(row.amountMinor)}</b></div>
            <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ width: `${String(row.percent)}%` }} /></div>
          </li>
        ))}
      </ul>
      {comparison !== null && <p className={styles.trend}>{comparison}</p>}
    </section>
  );
}
