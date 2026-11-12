"use client";

import { formatBdt } from "@moneytrace/contracts";
import { useEffect, useMemo, useState } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import type { AccountRow, AiUsageRow, BalanceRow, LedgerEntryRow, ReadModelGateway, SourceEventRow } from "../../shared/read-model-gateway";
import { AccountMenu } from "./AccountMenu";
import { CategoryChart } from "./CategoryChart";
import { aiSpendLabel, buildDashboard, monthRange } from "./dashboard-view-model";
import { MonthSwitch } from "./MonthSwitch";
import { toRecentItems } from "./recent-items";
import { RecentList } from "./RecentList";
import styles from "./dashboard.module.css";

const RECENT_LIMIT = 10;
const EVENT_WINDOW = 50;

/** The only screen after sign-in. Every figure waits for its first snapshot, so loading never reads as ৳0. */
export function DashboardScreen({
  gateway,
  nowMs,
  displayName,
  onSignOut,
}: {
  gateway: ReadModelGateway;
  nowMs: number;
  displayName?: string;
  onSignOut: () => Promise<void>;
}) {
  const [offset, setOffset] = useState(0);
  const [failed, setFailed] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [events, setEvents] = useState<SourceEventRow[] | null>(null);
  const [expenses, setExpenses] = useState<LedgerEntryRow[] | null>(null);
  const [previous, setPrevious] = useState<LedgerEntryRow[] | null>(null);
  const [income, setIncome] = useState<LedgerEntryRow[] | null>(null);
  const [usage, setUsage] = useState<AiUsageRow[] | null>(null);

  const month = useMemo(() => monthRange(nowMs, offset), [nowMs, offset]);
  const prior = useMemo(() => monthRange(nowMs, offset - 1), [nowMs, offset]);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const thisMonth = monthRange(nowMs, 0);
    const stops = [
      gateway.watchAccounts(setAccounts, onError),
      gateway.watchBalances(setBalances, onError),
      gateway.watchSourceEvents(EVENT_WINDOW, setEvents, onError),
      gateway.watchAiUsage(thisMonth.fromMs, thisMonth.toMs, setUsage, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, nowMs]);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    setExpenses(null);
    setPrevious(null);
    setIncome(null);
    const stops = [
      gateway.watchExpenseEntries(month.fromMs, month.toMs, setExpenses, onError),
      gateway.watchExpenseEntries(prior.fromMs, prior.toMs, setPrevious, onError),
      gateway.watchIncomeEntries(month.fromMs, month.toMs, setIncome, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, month, prior]);

  const loading = balances === null || events === null || expenses === null || previous === null || income === null;
  const view = loading
    ? null
    : buildDashboard({ balances, expenses, income, previousExpenses: previous, nowMs, offset, previousLabel: prior.label.split(" ")[0] ?? "" });
  const newUser = events !== null && events.length === 0;
  const recent = events === null ? [] : toRecentItems(events, accounts, RECENT_LIMIT);

  let body;
  if (newUser) {
    body = (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{DASHBOARD_COPY.newUserTitle}</p>
        <p>{DASHBOARD_COPY.newUserBody}</p>
      </div>
    );
  } else if (view === null) {
    body = <p role="status" className={styles.caption}>{DASHBOARD_COPY.loading}</p>;
  } else if (!view.hasActivity) {
    body = (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{DASHBOARD_COPY.emptyMonth(month.label)}</p>
        <p>{DASHBOARD_COPY.emptyMonthHint}</p>
      </div>
    );
  } else {
    body = (
      <div className={styles.columns}>
        <div>
          <div className={styles.tiles}>
            <div role="group" aria-label={DASHBOARD_COPY.spent} className={styles.tile}>
              <span className={styles.tileLabel}>{DASHBOARD_COPY.spent}</span>
              <span className={styles.tileValue}>{formatBdt(view.spentMinor)}</span>
            </div>
            <div role="group" aria-label={DASHBOARD_COPY.cameIn} className={styles.tile}>
              <span className={styles.tileLabel}>{DASHBOARD_COPY.cameIn}</span>
              <span className={styles.tileValue}>{formatBdt(view.incomeMinor)}</span>
            </div>
          </div>
          {view.unexplainedCashMinor > 0 && (
            <div role="note" aria-label={DASHBOARD_COPY.unexplained} className={styles.unexplained}>
              <span>{DASHBOARD_COPY.unexplained}<small>{DASHBOARD_COPY.unexplainedDetail}</small></span>
              <b>{formatBdt(view.unexplainedCashMinor)}</b>
            </div>
          )}
          {view.categories.length > 0 && <CategoryChart rows={view.categories} comparison={view.comparison} />}
        </div>
        <div>
          <section aria-labelledby="money-now" className={styles.card}>
            <h3 id="money-now">{DASHBOARD_COPY.moneyNow}</h3>
            <div role="group" aria-label={DASHBOARD_COPY.banksAndCash} className={styles.kv}><span>{DASHBOARD_COPY.banksAndCash}</span><b>{formatBdt(view.availableMinor)}</b></div>
            <div role="group" aria-label={DASHBOARD_COPY.cardsOwed} className={styles.kv}><span>{DASHBOARD_COPY.cardsOwed}</span><b>{formatBdt(view.cardsOwedMinor)}</b></div>
          </section>
          {recent.length > 0 && <RecentList items={recent} />}
        </div>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className="mt-sr-only">{DASHBOARD_COPY.appName}</h1>
      <div className={styles.bar}>
        <div>
          <p className={styles.greeting}>{DASHBOARD_COPY.greeting}</p>
          <p className={styles.name}>{displayName ?? ""}</p>
        </div>
        <AccountMenu aiSpend={usage === null ? null : aiSpendLabel(usage)} onSignOut={onSignOut} />
      </div>
      {failed && <p role="alert" className={styles.alert}>{DASHBOARD_COPY.readFailed}</p>}
      {!newUser && (
        <MonthSwitch label={month.label} canGoNext={offset < 0} onPrevious={() => { setOffset((n) => n - 1); }} onNext={() => { setOffset((n) => Math.min(0, n + 1)); }} />
      )}
      {body}
      {/* Piece 3 puts tips here. */}
      <section aria-hidden="true" className={styles.tips} />
    </main>
  );
}
