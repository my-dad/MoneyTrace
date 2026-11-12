"use client";

import { formatBdt } from "@moneytrace/contracts";
import { Button, EmptyState } from "@moneytrace/ui-kit";
import { useEffect, useState } from "react";
import { REPORTS_COPY } from "../../shared/copy";
import { dueLabel } from "../accounts/accounts-view-model";
import { NotAvailableYet } from "../shell/NotAvailableYet";
import type { PeriodKind, PeriodReport, ReportSource } from "./report-source";
import styles from "./reports.module.css";

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; report: PeriodReport | null };

const KINDS: PeriodKind[] = ["calendarMonth", "salaryCycle"];

/** Integer percent of the largest category, for a plain CSS bar. */
export const barPercent = (amountMinor: number, maxMinor: number): number =>
  maxMinor <= 0 ? 0 : Math.round((amountMinor * 100) / maxMinor);

const signed = (minor: number): string => (minor > 0 ? `+${formatBdt(minor)}` : minor < 0 ? `−${formatBdt(-minor)}` : formatBdt(0));

function trend(report: PeriodReport): string {
  if (report.comparison === null) return REPORTS_COPY.noComparison;
  const { name, expenseMinor } = report.comparison;
  const diff = report.expenseMinor - expenseMinor;
  if (diff === 0) return REPORTS_COPY.same(name);
  const args = [formatBdt(Math.abs(diff)), name, formatBdt(expenseMinor)] as const;
  return diff > 0 ? REPORTS_COPY.more(...args) : REPORTS_COPY.less(...args);
}

export function ReportsScreen({ source }: { source: ReportSource | null }) {
  const [kind, setKind] = useState<PeriodKind>("calendarMonth");
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    if (source === null) return;
    let live = true;
    setLoad({ status: "loading" });
    source
      .load(kind, offset)
      .then((report) => { if (live) setLoad({ status: "ready", report }); })
      .catch(() => { if (live) setLoad({ status: "failed" }); });
    return () => { live = false; };
  }, [source, kind, offset, attempt]);

  if (source === null) return <NotAvailableYet />;

  const period = source.period(kind, offset);
  const empty = load.status === "ready" && load.report === null;

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>{REPORTS_COPY.title}</h1>
        <div className={styles.seg} role="group" aria-label={REPORTS_COPY.kindGroup}>
          {KINDS.map((value) => (
            <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setOffset(0); }}>
              {REPORTS_COPY.kinds[value]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.period}>
        <button type="button" className={styles.nav} aria-label={REPORTS_COPY.previous} disabled={empty} onClick={() => { setOffset((n) => n - 1); }}>‹</button>
        <div className={styles.periodText}>
          <h2>{period.label}</h2>
          <p className={styles.caption}>{period.detail}</p>
        </div>
        <button type="button" className={styles.nav} aria-label={REPORTS_COPY.next} disabled={offset >= 0} onClick={() => { setOffset((n) => n + 1); }}>›</button>
      </div>
      {load.status === "loading" && <p role="status" className={styles.caption}>{REPORTS_COPY.loading}</p>}
      {load.status === "failed" && (
        <div role="alert" className={styles.alert}>
          <span>{REPORTS_COPY.readFailed}</span>
          <Button variant="secondary" onClick={() => { setAttempt((n) => n + 1); }}>{REPORTS_COPY.retry}</Button>
        </div>
      )}
      {empty && (
        <EmptyState
          title={REPORTS_COPY.emptyTitle(period.label)}
          description={REPORTS_COPY.emptyBody}
          action={<Button variant="secondary" onClick={() => { setOffset((n) => n + 1); }}>{REPORTS_COPY.later}</Button>}
        />
      )}
      {load.status === "ready" && load.report !== null && <Report report={load.report} />}
    </main>
  );
}

function Report({ report }: { report: PeriodReport }) {
  const max = Math.max(0, ...report.categories.map((row) => row.amountMinor));
  const owed = report.cards.reduce((sum, card) => sum + card.owedMinor, 0);
  return (
    <div className={styles.layout}>
      <div>
        <div className={styles.tiles}>
          <div className={styles.tile}><p className={styles.tileLabel}>{REPORTS_COPY.cameIn}</p><p className={styles.tileValue}>{formatBdt(report.incomeMinor)}</p></div>
          <div className={styles.tile}><p className={styles.tileLabel}>{REPORTS_COPY.spent}</p><p className={styles.tileValue}>{formatBdt(report.expenseMinor)}</p></div>
        </div>
        <p className={styles.trend}>{trend(report)}</p>
        {report.unexplainedCashMinor > 0 && (
          <div role="note" aria-label={REPORTS_COPY.unexplained} className={styles.unexplained}>
            <span><span>{REPORTS_COPY.unexplained}</span><span className={styles.detail}>{REPORTS_COPY.unexplainedDetail}</span></span>
            <b>{formatBdt(report.unexplainedCashMinor)}</b>
          </div>
        )}
        {report.categories.length > 0 && (
          <section aria-labelledby="where-it-went" className={styles.card}>
            <h3 id="where-it-went">{REPORTS_COPY.whereItWent}</h3>
            <ul className={styles.bars}>
              {report.categories.map((row) => (
                <li key={row.category}>
                  <div className={styles.barLabel}><span>{REPORTS_COPY.categoryNames[row.category] ?? row.category}</span><span>{formatBdt(row.amountMinor)}</span></div>
                  <div className={styles.track} aria-hidden="true"><div className={styles.fill} style={{ width: `${String(barPercent(row.amountMinor, max))}%` }} /></div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div>
        {report.movements.length > 0 && (
          <section aria-labelledby="movements" className={styles.card}>
            <h3 id="movements">{REPORTS_COPY.movements}</h3>
            <ul>
              {report.movements.map((row) => (
                <li key={row.accountId} className={styles.kv}><span>{row.name}</span><span>{signed(row.inMinor - row.outMinor)}</span></li>
              ))}
            </ul>
            <p className={styles.note}>{REPORTS_COPY.movementsNote}</p>
          </section>
        )}
        {report.cards.length > 0 && (
          <section aria-labelledby="cards" className={styles.card}>
            <h3 id="cards">{REPORTS_COPY.cards}</h3>
            <ul>
              {report.cards.map((card) => (
                <li key={card.accountId} className={styles.kv}><span>{`${card.name} · ${REPORTS_COPY.due(dueLabel(card.dueDate))}`}</span><span>{formatBdt(card.owedMinor)}</span></li>
              ))}
              <li className={`${styles.kv ?? ""} ${styles.total ?? ""}`}><span>{REPORTS_COPY.totalOwed}</span><span>{formatBdt(owed)}</span></li>
            </ul>
          </section>
        )}
        {report.unsettled.length > 0 && (
          <section aria-labelledby="unsettled" className={styles.card}>
            <h3 id="unsettled">{REPORTS_COPY.unsettled}</h3>
            <ul>
              {report.unsettled.map((item) => (
                <li key={item.id} className={styles.unsettledItem}>
                  <span><span>{item.title}</span><span className={styles.detail}>{item.detail}</span></span>
                  <b>{formatBdt(item.amountMinor)}</b>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
