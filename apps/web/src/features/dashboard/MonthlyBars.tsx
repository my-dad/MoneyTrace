"use client";

import { formatBdt } from "@moneytrace/contracts";
import { useState } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { MonthTotal } from "./chart-models";
import { shortMonth } from "./chart-format";
import styles from "./dashboard.module.css";
import charts from "./charts.module.css";

const W = 320;
const H = 150;
const BASE = 128;
const TOP = 10;

/** Came in and Spent side by side for six months, one scale for both. */
export function MonthlyBars({ rows }: { rows: MonthTotal[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inMinor, r.outMinor)));
  const slot = W / Math.max(1, rows.length);
  const bar = Math.min(16, slot / 3);
  const h = (minor: number) => (minor * (BASE - TOP)) / max;
  const shown = hover === null ? null : rows[hover] ?? null;
  return (
    <section aria-labelledby="in-vs-out" className={styles.card}>
      <h3 id="in-vs-out">{DASHBOARD_COPY.inVsOut}</h3>
      <p className={charts.legend} aria-hidden="true">
        <span className={charts.legendIn}>{DASHBOARD_COPY.cameIn}</span>
        <span className={charts.legendOut}>{DASHBOARD_COPY.spent}</span>
      </p>
      <div className={charts.plot}>
        <svg viewBox={`0 0 ${String(W)} ${String(H)}`} className={charts.bars} role="img" aria-label={DASHBOARD_COPY.inVsOutAria(rows.length)}>
          <line x1="0" x2={W} y1={BASE} y2={BASE} className={charts.axis} />
          {rows.map((r, i) => {
            const cx = slot * i + slot / 2;
            return (
              <g key={r.label} onPointerEnter={() => { setHover(i); }} onPointerLeave={() => { setHover(null); }}>
                <rect x={slot * i} y={TOP} width={slot} height={BASE - TOP} className={hover === i ? charts.hoverBand : charts.hitBand} />
                <rect x={cx - bar - 1} y={BASE - h(r.inMinor)} width={bar} height={h(r.inMinor)} rx="4" className={charts.barIn} />
                <rect x={cx + 1} y={BASE - h(r.outMinor)} width={bar} height={h(r.outMinor)} rx="4" className={charts.barOut} />
                <text x={cx} y={H - 4} textAnchor="middle" className={charts.tick}>{shortMonth(r.label)}</text>
              </g>
            );
          })}
        </svg>
        {shown !== null && (
          <p className={charts.tooltip} aria-hidden="true">
            {shortMonth(shown.label)} · {DASHBOARD_COPY.cameIn} <b>{formatBdt(shown.inMinor)}</b> · {DASHBOARD_COPY.spent} <b>{formatBdt(shown.outMinor)}</b>
          </p>
        )}
      </div>
      <table className="mt-sr-only">
        <caption>{DASHBOARD_COPY.inVsOut}</caption>
        <thead>
          <tr><th scope="col">{DASHBOARD_COPY.month}</th><th scope="col">{DASHBOARD_COPY.cameIn}</th><th scope="col">{DASHBOARD_COPY.spent}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><th scope="row">{shortMonth(r.label)}</th><td>{formatBdt(r.inMinor)}</td><td>{formatBdt(r.outMinor)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
