"use client";

import { SECTOR_LABELS, formatBdt, type SectorId } from "@moneytrace/contracts";
import { useState, type CSSProperties } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { SectorSlice } from "./chart-models";
import { percentOf } from "./chart-format";
import type { CategoryRow } from "./dashboard-view-model";
import styles from "./dashboard.module.css";
import charts from "./charts.module.css";

const colorOf = (sector: SectorId): string => `var(--mt-sector-${sector})`;

const R = 54;
const C = 2 * Math.PI * R;
/** A 2px surface gap between slices, so neighbours never touch. */
const GAP = 2;

/** Spending by sector: a donut, the ranking beside it, and a table with the same numbers. */
export function CategoryChart({ rows, slices, comparison }: { rows: CategoryRow[]; slices: SectorSlice[]; comparison: string | null }) {
  const [active, setActive] = useState<SectorId | null>(null);
  const top = slices[0];
  const focus = slices.find((s) => s.sector === active) ?? top;
  let offset = 0;
  return (
    <section aria-labelledby="where-it-went" className={styles.card}>
      <h3 id="where-it-went">{DASHBOARD_COPY.whereItWent}</h3>
      {top === undefined ? (
        <p className={charts.empty}>{DASHBOARD_COPY.noSpendingYet}</p>
      ) : (
        <>
          <p className={charts.summary}>{DASHBOARD_COPY.sectorSummary(SECTOR_LABELS[top.sector], percentOf(top.shareBp))}</p>
          <div className={charts.donutRow}>
            <svg
              viewBox="0 0 140 140"
              className={charts.donut}
              role="img"
              aria-label={`${DASHBOARD_COPY.bySector}: ${slices.map((s) => `${SECTOR_LABELS[s.sector]} ${String(percentOf(s.shareBp))}%`).join(", ")}`}
            >
              {slices.map((s) => {
                const length = (C * s.shareBp) / 10_000;
                const dash = Math.max(0, length - (slices.length > 1 ? GAP : 0));
                const segment = (
                  <circle
                    key={s.sector}
                    cx="70"
                    cy="70"
                    r={R}
                    fill="none"
                    stroke={colorOf(s.sector)}
                    strokeWidth={active === s.sector ? 24 : 20}
                    strokeDasharray={`${String(dash)} ${String(C - dash)}`}
                    strokeDashoffset={String(-offset)}
                    transform="rotate(-90 70 70)"
                    className={charts.slice}
                    onPointerEnter={() => { setActive(s.sector); }}
                    onPointerLeave={() => { setActive(null); }}
                  />
                );
                offset += length;
                return segment;
              })}
              {focus !== undefined && (
                <>
                  <text x="70" y="66" textAnchor="middle" className={charts.donutValue}>{formatBdt(focus.amountMinor)}</text>
                  <text x="70" y="84" textAnchor="middle" className={charts.donutLabel}>{SECTOR_LABELS[focus.sector]}</text>
                </>
              )}
            </svg>
            <ul className={styles.bars}>
              {rows.map((row, index) => (
                <li
                  key={row.category}
                  style={{ "--bar": colorOf(row.category), "--delay": `${String(index * 60)}ms` } as CSSProperties}
                  className={active === row.category ? charts.activeRow : undefined}
                  onPointerEnter={() => { setActive(row.category); }}
                  onPointerLeave={() => { setActive(null); }}
                >
                  <div className={styles.barLabel}><span><i className={styles.dot} aria-hidden="true" />{SECTOR_LABELS[row.category]}</span><b>{formatBdt(row.amountMinor)}</b></div>
                  <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ width: `${String(row.percent)}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
          <table className="mt-sr-only">
            <caption>{DASHBOARD_COPY.bySector}</caption>
            <tbody>
              {slices.map((s) => (
                <tr key={s.sector}>
                  <th scope="row">{SECTOR_LABELS[s.sector]}</th>
                  <td>{formatBdt(s.amountMinor)}</td>
                  <td>{`${String(percentOf(s.shareBp))}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {comparison !== null && <p className={styles.trend}>{comparison}</p>}
    </section>
  );
}
