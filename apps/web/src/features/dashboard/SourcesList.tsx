import type { CSSProperties } from "react";
import { formatBdt } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { SourceRow } from "./dashboard-view-model";
import styles from "./dashboard.module.css";

/** Money tracked across every source, and each source's money in and out this month (CR-008). */
export function SourcesList({ netMoneyMinor, sources }: { netMoneyMinor: number; sources: SourceRow[] }) {
  return (
    <section aria-labelledby="net-money" className={`${styles.card ?? ""} ${styles.moneyCard ?? ""}`}>
      <h3 id="net-money">{DASHBOARD_COPY.netMoney}</h3>
      <div role="group" aria-label={DASHBOARD_COPY.netMoney}>
        <p className={styles.net}>{formatBdt(netMoneyMinor)}</p>
      </div>
      <p className={styles.netNote}>{DASHBOARD_COPY.netMoneyNote}</p>
      {sources.length > 0 && (
        <ul className={styles.sources}>
          {sources.map((row, index) => (
            <li key={row.accountId}>
              <span className={styles.chip} style={{ "--chip": `var(--mt-cat-${String((index % 6) + 1)})` } as CSSProperties}>{row.label}</span>
              <small>{DASHBOARD_COPY.sourceInOut(formatBdt(row.inMinor), formatBdt(row.outMinor))}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
