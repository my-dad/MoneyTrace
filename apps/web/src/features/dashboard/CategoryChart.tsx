import { formatBdt } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { CategoryRow } from "./dashboard-view-model";
import styles from "./dashboard.module.css";

const nameOf = (category: string): string =>
  DASHBOARD_COPY.categories[category] ?? category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ");

export function CategoryChart({ rows, comparison }: { rows: CategoryRow[]; comparison: string | null }) {
  return (
    <section aria-labelledby="where-it-went" className={styles.card}>
      <h3 id="where-it-went">{DASHBOARD_COPY.whereItWent}</h3>
      <ul className={styles.bars}>
        {rows.map((row) => (
          <li key={row.category}>
            <div className={styles.barLabel}><span>{nameOf(row.category)}</span><b>{formatBdt(row.amountMinor)}</b></div>
            <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ width: `${String(row.percent)}%` }} /></div>
          </li>
        ))}
      </ul>
      {comparison !== null && <p className={styles.trend}>{comparison}</p>}
    </section>
  );
}
