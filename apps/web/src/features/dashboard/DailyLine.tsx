"use client";

import { formatBdt } from "@moneytrace/contracts";
import { useState } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { DayPoint } from "./chart-models";
import styles from "./dashboard.module.css";
import charts from "./charts.module.css";

const W = 320;
const H = 140;
const PAD = { top: 12, right: 10, bottom: 22, left: 10 };

/** Spending added up through the month, with last month dashed behind it and a crosshair on hover. */
export function DailyLine({
  points,
  previous,
  monthShort,
  daysInMonth,
  summary,
}: {
  points: DayPoint[];
  previous: DayPoint[];
  monthShort: string;
  /** The shown month's length: the axis runs to its last day. */
  daysInMonth: number;
  summary: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const days = Math.max(daysInMonth, 2);
  const max = Math.max(1, ...points.map((p) => p.minor), ...previous.map((p) => p.minor));
  const x = (day: number) => PAD.left + ((day - 1) * (W - PAD.left - PAD.right)) / (days - 1);
  const y = (minor: number) => H - PAD.bottom - (minor * (H - PAD.top - PAD.bottom)) / max;
  const path = (ps: DayPoint[]) => ps.filter((p) => p.day <= days).map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.minor).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const shown = hover === null ? null : points.find((p) => p.day === hover) ?? null;
  return (
    <section aria-labelledby="day-by-day" className={styles.card}>
      <h3 id="day-by-day">{DASHBOARD_COPY.dayByDay}</h3>
      <p className={charts.summary}>{summary}</p>
      <div className={charts.plot}>
        <svg
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className={charts.line}
          role="img"
          aria-label={`${DASHBOARD_COPY.dayByDay}: ${summary}`}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (box.width === 0) return;
            const ratio = (event.clientX - box.left) / box.width;
            const day = Math.round(1 + ((ratio * W - PAD.left) / (W - PAD.left - PAD.right)) * (days - 1));
            setHover(Math.min(points.length, Math.max(1, day)));
          }}
          onPointerLeave={() => { setHover(null); }}
        >
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className={charts.axis} />
          {previous.length > 1 && <path d={path(previous)} className={charts.previousLine} />}
          {points.length > 0 && (
            <>
              <path d={`${path(points)} L${x(last?.day ?? 1).toFixed(1)},${String(H - PAD.bottom)} L${String(PAD.left)},${String(H - PAD.bottom)} Z`} className={charts.area} />
              <path d={path(points)} className={charts.currentLine} />
            </>
          )}
          {last !== undefined && <circle cx={x(last.day)} cy={y(last.minor)} r="4.5" className={charts.endDot} />}
          {shown !== null && (
            <>
              <line x1={x(shown.day)} x2={x(shown.day)} y1={PAD.top} y2={H - PAD.bottom} className={charts.crosshair} />
              <circle cx={x(shown.day)} cy={y(shown.minor)} r="4" className={charts.endDot} />
            </>
          )}
          <text x={PAD.left} y={H - 6} className={charts.tick}>1 {monthShort}</text>
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className={charts.tick}>{String(days)} {monthShort}</text>
        </svg>
        {shown !== null && (
          <p className={charts.tooltip} aria-hidden="true">
            {String(shown.day)} {monthShort} · <b>{formatBdt(shown.minor)}</b>
          </p>
        )}
      </div>
      <p className={charts.legend} aria-hidden="true">
        <span className={charts.legendCurrent}>{DASHBOARD_COPY.thisMonth}</span>
        {previous.length > 1 && <span className={charts.legendPrevious}>{DASHBOARD_COPY.lastMonth}</span>}
      </p>
      <table className="mt-sr-only">
        <caption>{DASHBOARD_COPY.dayByDay}</caption>
        <thead>
          <tr><th scope="col">{DASHBOARD_COPY.day}</th><th scope="col">{DASHBOARD_COPY.spentSoFar}</th></tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}><th scope="row">{`${String(p.day)} ${monthShort}`}</th><td>{formatBdt(p.minor)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
