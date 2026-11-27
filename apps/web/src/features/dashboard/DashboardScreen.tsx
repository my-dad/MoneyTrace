"use client";

import { foldSector, formatBdt, netOf, SYSTEM_CASH_ACCOUNT_ID } from "@moneytrace/contracts";
import { Button } from "@moneytrace/ui-kit";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { dhakaDate } from "../../shared/dhaka-date";
import type { TransactionRow, AccountRow, BalanceRow, LedgerEntryRow, ReadModelGateway, SourceEventRow, TipsRow } from "../../shared/read-model-gateway";
import { useChatOpener } from "../chat/ChatLauncher";
import { AccountMenu } from "./AccountMenu";
import { CategoryChart } from "./CategoryChart";
import { buildDashboard, merchantsOf, monthRange } from "./dashboard-view-model";
import { MonthSwitch } from "./MonthSwitch";
import { toRecentItems, type RecentItem } from "./recent-items";
import { RecentList, type Editable, type Sortable } from "./RecentList";
import { CashIncomeForm, type CashIncomeCommands, type CashIncomeMode } from "./CashIncomeForm";
import { manualIncomes } from "./manual-income";
import { dailyCumulative, monthlyTotals, sectorSlices, topMerchants, type DayPoint } from "./chart-models";
import { shortMonth } from "./chart-format";
import { DailyLine } from "./DailyLine";
import { MonthlyBars } from "./MonthlyBars";
import { TopMerchants } from "./TopMerchants";
import { SectorPicker, type TagMerchant } from "./SectorPicker";
import { SourcesList } from "./SourcesList";
import { TipsCard } from "./TipsCard";
import { tipsView } from "./tips-view";
import styles from "./dashboard.module.css";

const RECENT_LIMIT = 10;
const DAY_MS = 86_400_000;
/** How far back Recent's spends are read for their sector: well past its ten rows. */
const RECENT_WINDOW_MS = 120 * DAY_MS;
const EVENT_WINDOW = 50;
/** Figures often change in bursts (a sort moves several spends): wait for them to settle. */
const FIGURES_SETTLE_MS = 1500;

/** The only screen after sign-in. Every figure waits for its first snapshot, so loading never reads as ৳0. */
export function DashboardScreen({
  gateway,
  nowMs,
  displayName,
  onSignOut,
  onDeleteAccount = () => Promise.reject(new Error("account deletion is not available here")),
  tagMerchant,
  cashIncome,
  avatar,
  onEditProfile,
  refreshTips,
}: {
  gateway: ReadModelGateway;
  nowMs: number;
  displayName?: string;
  onSignOut: () => Promise<void>;
  onDeleteAccount?: (confirmation: string) => Promise<void>;
  /** Sorts a shop into a sector; without it, nothing offers to sort. */
  tagMerchant?: TagMerchant;
  /** Adds and fixes cash income; without it, nothing offers to. */
  cashIncome?: CashIncomeCommands;
  /** The user's picture beside their name. */
  avatar?: ReactNode;
  onEditProfile?: () => void;
  /** Saves this month's tip figures and asks for advice when due; without it, tips are only read. */
  refreshTips?: (request: { force: boolean }) => Promise<{ outcome: "made" | "unchanged" | "factsOnly" | "notEnoughData" | "limitReached" }>;
}) {
  const [offset, setOffset] = useState(0);
  const [failed, setFailed] = useState(false);
  const chat = useChatOpener();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [events, setEvents] = useState<SourceEventRow[] | null>(null);
  const [expenses, setExpenses] = useState<LedgerEntryRow[] | null>(null);
  const [previous, setPrevious] = useState<LedgerEntryRow[] | null>(null);
  const [sourceEntries, setSourceEntries] = useState<LedgerEntryRow[] | null>(null);
  const [income, setIncome] = useState<LedgerEntryRow[] | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
  const [sorting, setSorting] = useState<Sortable | null>(null);
  const [recentIncome, setRecentIncome] = useState<LedgerEntryRow[]>([]);
  const [incomeForm, setIncomeForm] = useState<CashIncomeMode | null>(null);
  const [sixExpenses, setSixExpenses] = useState<LedgerEntryRow[]>([]);
  const [sixIncome, setSixIncome] = useState<LedgerEntryRow[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<TransactionRow[]>([]);
  const [tips, setTips] = useState<TipsRow | null>(null);
  const [tipsBusy, setTipsBusy] = useState(false);
  const [tipsFailed, setTipsFailed] = useState(false);
  const [tipsLimit, setTipsLimit] = useState(false);
  const [tipsDemo, setTipsDemo] = useState(false);
  const askedForTips = useRef(false);

  /** One tips refresh; the stored tips keep showing while it runs, and its status is honest. */
  const askTips = useMemo(
    () => (force: boolean, quiet = false) => {
      if (refreshTips === undefined) return;
      // A quiet refresh only re-saves the figures after they changed: no status, no lost state.
      if (!quiet) {
        setTipsBusy(true);
        setTipsFailed(false);
        setTipsDemo(false);
      }
      refreshTips({ force })
        .then((reply) => {
          if (quiet) return;
          setTipsLimit(reply.outcome === "limitReached");
          // New tips pressed, but no new advice was stored: say so, never "Made today".
          if (force && reply.outcome === "factsOnly") setTipsFailed(true);
        })
        .catch((error: unknown) => {
          if (quiet) return;
          // The demo saves nothing: silent when the dashboard opens, said when New tips is pressed.
          if (error instanceof DemoUnavailableError) setTipsDemo(force);
          else setTipsFailed(true);
        })
        .finally(() => { if (!quiet) setTipsBusy(false); });
    },
    [refreshTips],
  );

  // Once per visit, in the background, and only for the current month (which a visit opens on).
  useEffect(() => {
    if (askedForTips.current) return;
    askedForTips.current = true;
    askTips(false);
  }, [askTips]);

  const month = useMemo(() => monthRange(nowMs, offset), [nowMs, offset]);
  const prior = useMemo(() => monthRange(nowMs, offset - 1), [nowMs, offset]);
  /** The six months ending with the one shown, oldest first, for Came in vs Spent. */
  const sixMonths = useMemo(() => [5, 4, 3, 2, 1, 0].map((back) => monthRange(nowMs, offset - back)), [nowMs, offset]);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const stops = [
      gateway.watchAccounts(setAccounts, onError),
      gateway.watchBalances(setBalances, onError),
      gateway.watchSourceEvents(EVENT_WINDOW, setEvents, onError),
      // The spends behind Recent: their sector and shop, so an unsorted one can be sorted.
      gateway.watchTransactions(nowMs - RECENT_WINDOW_MS, nowMs + DAY_MS, setRecentTransactions, onError),
      // Income behind Recent, so cash income shows at its amount after any edit.
      gateway.watchIncomeEntries(nowMs - RECENT_WINDOW_MS, nowMs + DAY_MS, setRecentIncome, onError),
      gateway.watchTips(setTips, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, nowMs]);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    setExpenses(null);
    setPrevious(null);
    setIncome(null);
    setSourceEntries(null);
    const stops = [
      gateway.watchSourceEntries(month.fromMs, month.toMs, setSourceEntries, onError),
      gateway.watchExpenseEntries(month.fromMs, month.toMs, setExpenses, onError),
      gateway.watchExpenseEntries(prior.fromMs, prior.toMs, setPrevious, onError),
      gateway.watchIncomeEntries(month.fromMs, month.toMs, setIncome, onError),
      // Each spend's shop, for Top shops.
      gateway.watchTransactions(month.fromMs, month.toMs, setMonthTransactions, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, month, prior]);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const from = sixMonths[0]?.fromMs ?? month.fromMs;
    const stops = [
      gateway.watchExpenseEntries(from, month.toMs, setSixExpenses, onError),
      gateway.watchIncomeEntries(from, month.toMs, setSixIncome, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, month, sixMonths]);

  // A sort, a cash count or a new SMS changes the figures: re-save the tips' figures so they keep
  // matching the tiles (cheap: the server makes no AI call unless one is due).
  const figuresKey =
    offset !== 0 || balances === null || expenses === null || income === null
      ? null
      : [netOf(expenses, "debit"), expenses.length, netOf(income, "credit"), balances.find((b) => b.accountId === SYSTEM_CASH_ACCOUNT_ID)?.debitMinusCreditMinor ?? 0].join("|");
  const lastFiguresKey = useRef<string | null>(null);
  useEffect(() => {
    if (figuresKey === null) return;
    const before = lastFiguresKey.current;
    lastFiguresKey.current = figuresKey;
    if (before === null || before === figuresKey) return;
    const timer = setTimeout(() => { askTips(false, true); }, FIGURES_SETTLE_MS);
    return () => { clearTimeout(timer); };
  }, [figuresKey, askTips]);

  const loading = balances === null || events === null || expenses === null || previous === null || income === null || sourceEntries === null;
  const view = loading
    ? null
    : buildDashboard({ balances, expenses, income, previousExpenses: previous, nowMs, offset, previousLabel: prior.label.split(" ")[0] ?? "", accounts, sourceEntries });
  const newUser = events !== null && events.length === 0;
  const recent = events === null ? [] : toRecentItems(events, accounts, RECENT_LIMIT);
  const unsorted = new Map(
    recentTransactions
      .filter((t) => t.state === "posted" && t.merchantKey !== undefined && t.merchant !== undefined && foldSector(t.category ?? "uncategorized") === "uncategorized")
      .map((t): [string, Sortable] => [t.id, { key: t.merchantKey ?? "", name: t.merchant ?? "" }]),
  );
  const sortOf = (item: RecentItem): Sortable | null => unsorted.get(`txn-${item.id}`) ?? null;
  const manual = manualIncomes(events ?? [], recentTransactions, recentIncome);
  const recentShown = recent.map((item) => {
    const income = manual.get(item.id);
    return income === undefined ? item : { ...item, amountMinor: income.amountMinor };
  });
  const editOf = (item: RecentItem): Editable | null => manual.get(item.id) ?? null;
  /** The unsorted tip sorts the biggest unsorted shop this month, when there is a named one. */
  const unsortedShop = tagMerchant === undefined ? undefined : merchantsOf(expenses ?? [], monthTransactions).find((m) => m.sector === "uncategorized" && m.key !== "");
  const sortTip: Sortable | undefined = unsortedShop === undefined ? undefined : { key: unsortedShop.key, name: unsortedShop.name };

  let body;
  if (newUser) {
    body = (
      <div className={styles.empty}>
        <div className={styles.welcomeArt} aria-hidden="true">
          <span className={styles.coin}>৳</span>
          <span className={styles.coin}>৳</span>
          <span className={styles.coin}>৳</span>
        </div>
        <p className={styles.emptyTitle}>{DASHBOARD_COPY.newUserTitle}</p>
        <p>{DASHBOARD_COPY.newUserBody}</p>
        <ol className={styles.steps}>
          {DASHBOARD_COPY.newUserSteps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <b>{step.title}</b>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
        {chat !== null && (
          <>
            <div className={styles.emptyActions}>
              <Button className={styles.pasteButton} onClick={() => { chat.openChat("paste"); }}>{DASHBOARD_COPY.pasteSms}</Button>
              <Button variant="secondary" className={styles.pasteButton} onClick={() => { chat.openChat(); }}>{DASHBOARD_COPY.tellPurchase}</Button>
            </div>
            <p className={styles.howTo}>{DASHBOARD_COPY.howToCopy}</p>
          </>
        )}
      </div>
    );
  } else if (view === null) {
    body = <p role="status" className={styles.caption}>{DASHBOARD_COPY.loading}</p>;
  } else {
    // Only Spent, Came in and the chart belong to the month; balances, unexplained cash and the
    // latest messages are shown on every month.
    body = (
      <div className={styles.columns}>
        <div>
          {view.hasActivity ? (
            <div className={styles.tiles}>
              <div role="group" aria-label={DASHBOARD_COPY.spent} className={`${styles.tile ?? ""} ${styles.tileSpent ?? ""}`}>
                <span className={styles.tileIcon} aria-hidden="true">↗</span>
                <span className={styles.tileLabel}>{DASHBOARD_COPY.spent}</span>
                <span className={styles.tileValue}>{formatBdt(view.spentMinor)}</span>
              </div>
              <div role="group" aria-label={DASHBOARD_COPY.cameIn} className={`${styles.tile ?? ""} ${styles.tileIncome ?? ""}`}>
                <span className={styles.tileIcon} aria-hidden="true">↙</span>
                <span className={styles.tileLabel}>{DASHBOARD_COPY.cameIn}</span>
                <span className={styles.tileValue}>{formatBdt(view.incomeMinor)}</span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyMonth}>
              <p className={styles.emptyTitle}>{DASHBOARD_COPY.emptyMonth(month.label)}</p>
              {offset < 0 && <p>{DASHBOARD_COPY.emptyMonthHint}</p>}
            </div>
          )}
          {view.unexplainedCashMinor > 0 && (
            <div role="note" aria-label={DASHBOARD_COPY.unexplained} className={styles.unexplained}>
              <span>{DASHBOARD_COPY.unexplained}<small>{DASHBOARD_COPY.unexplainedDetail}</small></span>
              <b>{formatBdt(view.unexplainedCashMinor)}</b>
              {chat !== null && (
                <button
                  type="button"
                  className={styles.countLink}
                  onClick={() => {
                    chat.openChat("cashCount");
                  }}
                >
                  {DASHBOARD_COPY.countCash}
                </button>
              )}
            </div>
          )}
          {view.hasActivity && (
            <>
              <CategoryChart rows={view.categories} slices={sectorSlices(expenses ?? [])} comparison={null} />
              <DailyLine
                points={dailyCumulative(expenses ?? [], month, nowMs)}
                previous={dailyCumulative(previous ?? [], prior, nowMs)}
                monthShort={shortMonth(month.label)}
                daysInMonth={Number(dhakaDate(month.toMs).slice(8, 10))}
                summary={dailySummary(dailyCumulative(expenses ?? [], month, nowMs), month.label, view.comparison, offset === 0)}
              />
            </>
          )}
          <MonthlyBars rows={monthlyTotals(sixExpenses, sixIncome, sixMonths)} />
        </div>
        <div>
          {offset === 0 && (
            <TipsCard
              view={tipsView(tips, nowMs)}
              busy={tipsBusy}
              failed={tipsFailed}
              limitReached={tipsLimit}
              demo={tipsDemo}
              {...(refreshTips === undefined ? {} : { onNewTips: () => { askTips(true); } })}
              {...(sortTip === undefined ? {} : { onSort: () => { setSorting(sortTip); } })}
              {...(chat === null ? {} : { onCountCash: () => { chat.openChat("cashCount"); } })}
            />
          )}
          {view.hasActivity && (
            <TopMerchants rows={topMerchants(merchantsOf(expenses ?? [], monthTransactions))} {...(tagMerchant === undefined ? {} : { onSort: setSorting })} />
          )}
          <SourcesList netMoneyMinor={view.netMoneyMinor} sources={view.sources} />
          {recent.length > 0 && (
            <RecentList
              items={recentShown}
              sortOf={sortOf}
              editOf={editOf}
              {...(tagMerchant === undefined ? {} : { onSort: setSorting })}
              {...(cashIncome === undefined ? {} : { onEdit: (income: Editable) => { setIncomeForm({ kind: "edit", sourceEventId: income.sourceEventId, amountMinor: income.amountMinor, from: income.from }); } })}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className="mt-sr-only">{DASHBOARD_COPY.appName}</h1>
      <div className={styles.bar}>
        <div className={styles.who}>
          {avatar ??
            (displayName !== undefined && displayName !== "" && (
              <span className={styles.avatar} aria-hidden="true">{displayName.trim().charAt(0).toUpperCase()}</span>
            ))}
          <div>
            <p className={styles.greeting}>{DASHBOARD_COPY.greeting}</p>
            <p className={styles.name}>{displayName ?? ""}</p>
          </div>
        </div>
        <AccountMenu onSignOut={onSignOut} onDeleteAccount={onDeleteAccount} {...(onEditProfile === undefined ? {} : { onEditProfile })} />
      </div>
      {failed && <p role="alert" className={styles.alert}>{DASHBOARD_COPY.readFailed}</p>}
      {chat !== null && chat.waiting > 0 && (
        <button type="button" className={styles.needsAnswer} onClick={() => { chat.openChat(); }}>
          <span>{DASHBOARD_COPY.questionsWaiting(chat.waiting)}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {!newUser && (
        <MonthSwitch label={month.label} canGoNext={offset < 0} onPrevious={() => { setOffset((n) => n - 1); }} onNext={() => { setOffset((n) => Math.min(0, n + 1)); }} />
      )}
      {body}
      {/* Floats just above the chat button, so both actions sit under the thumb. */}
      {cashIncome !== undefined && (
        <button type="button" className={styles.addIncome} aria-label={DASHBOARD_COPY.addIncomeLabel} onClick={() => { setIncomeForm({ kind: "add" }); }}>
          <span className={styles.addIncomeIcon} aria-hidden="true">+</span>
          {DASHBOARD_COPY.addIncomeButton}
        </button>
      )}
      {incomeForm !== null && cashIncome !== undefined && (
        <CashIncomeForm mode={incomeForm} nowMs={nowMs} commands={cashIncome} onClose={() => { setIncomeForm(null); }} />
      )}
      {sorting !== null && tagMerchant !== undefined && (
        <SectorPicker merchantName={sorting.name} merchantKey={sorting.key} tagMerchant={tagMerchant} onClose={() => { setSorting(null); }} />
      )}
    </main>
  );
}

/** "৳18,640 by 6 Nov · ৳1,740 more than this time last month", or "৳52,300 in October 2026". */
function dailySummary(points: DayPoint[], monthLabel: string, comparison: string | null, current: boolean): string {
  const last = points[points.length - 1];
  const total = formatBdt(last?.minor ?? 0);
  const head = current ? `${total} by ${String(last?.day ?? 1)} ${shortMonth(monthLabel)}` : `${total} in ${monthLabel}`;
  return comparison === null ? head : `${head} · ${comparison}`;
}
