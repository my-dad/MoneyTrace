"use client";

import { formatBdt } from "@moneytrace/contracts";
import { Card, EmptyState, List, ListItem, MoneyText } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  AccountRow,
  BalanceRow,
  ExpenseEntryRow,
  FollowUpRow,
  ReadModelGateway,
} from "../../shared/read-model-gateway";
import { buildHomeViewModel, monthRangeInZone, SYSTEM_CASH_ACCOUNT_ID } from "./home-view-model";
import styles from "./home.module.css";
import { NavIcon } from "../shell/NavIcon";
import { remindersLabel } from "../shell/nav-labels";

const CHAT_PATH = "/chat";

const updatedFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function HomeScreen({
  gateway,
  displayName,
}: {
  gateway: ReadModelGateway;
  displayName?: string;
}) {
  // Null until the first snapshot, so "not loaded yet" never reads as "you have nothing".
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntryRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const openReminders = followUps.filter((followUp) => followUp.state === "open").length;
  const nowMs = useMemo(() => Date.now(), []);

  useEffect(() => {
    const onError = () => {
      setFailed(true);
    };
    const range = monthRangeInZone(nowMs, "Asia/Dhaka");
    const stops = [
      gateway.watchAccounts(setAccounts, onError),
      gateway.watchBalances(setBalances, onError),
      gateway.watchFollowUps(setFollowUps, onError),
      gateway.watchExpenseEntries(range.fromMs, range.toMs, setExpenses, onError),
    ];
    return () => {
      stops.forEach((stop) => {
        stop();
      });
    };
  }, [gateway, nowMs]);

  const vm = useMemo(
    () =>
      buildHomeViewModel({
        accounts: accounts ?? [],
        balances: balances ?? [],
        followUps,
        expenseEntries: expenses ?? [],
        nowMs,
      }),
    [accounts, balances, followUps, expenses, nowMs],
  );

  const failure = failed && (
    <p role="alert" className={styles.alert}>
      Couldn&apos;t load your latest money picture. Anything shown below may be out of date.
    </p>
  );

  if (accounts === null) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.logo}>MoneyTrace</h1>
        </header>
        {failure}
        {!failed && <p role="status">Loading your accounts…</p>}
      </main>
    );
  }

  if (accounts.every((account) => account.id === SYSTEM_CASH_ACCOUNT_ID)) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.logo}>MoneyTrace</h1>
          <span>{displayName ?? ""}</span>
        </header>
        {failure}
        <EmptyState
          title="Let's set up your first account"
          description="Add your accounts. Each one starts at ৳0 and changes only with what you record."
          action={<Link href="/onboarding" className="mt-button mt-button--primary">Start setup</Link>}
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Good to see you</p>
          <h1>{displayName ?? "there"}</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/reminders" className={styles.iconLink} aria-label={remindersLabel(openReminders)}>
            <NavIcon name="bell" />
            {openReminders > 0 && <span className={styles.badge} aria-hidden="true">{openReminders}</span>}
          </Link>
          <Link href="/settings" className={styles.iconLink} aria-label="Settings">
            <NavIcon name="settings" />
          </Link>
        </div>
      </header>
      {failure}
      {balances !== null && (
        <>
          <section aria-label="Money summary" className={styles.summary}>
            <Card>
              <span className={styles.label}>Available</span>
              <MoneyText text={formatBdt(vm.availableMinor)} />
            </Card>
            <Card>
              <span className={styles.label}>Cash</span>
              <MoneyText text={formatBdt(vm.cashMinor)} />
            </Card>
            <Card>
              <span className={styles.label}>Card dues</span>
              <MoneyText text={formatBdt(vm.cardDuesMinor)} />
              <small>Money you owe. Not taken out of available money.</small>
            </Card>
          </section>
          {vm.unexplainedCashMinor > 0 && (
            <Card variant="unexplained" className={styles.unexplained}>
              <div>
                <strong>Cash not yet explained</strong>
                <MoneyText text={formatBdt(vm.unexplainedCashMinor)} variant="unexplained" />
                <p>It counts in your total and isn&apos;t treated as spending.</p>
              </div>
              <Link
                href={CHAT_PATH}
                className={`mt-button mt-button--secondary ${styles.linkButton ?? ""}`}
              >
                Explain
              </Link>
            </Card>
          )}
        </>
      )}
      {expenses !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>Spending this month</h2>
            <MoneyText text={formatBdt(vm.spendingThisMonthMinor)} />
          </div>
        </section>
      )}
      {vm.freshnessAtMs > 0 && (
        <p className={styles.freshness}>
          Last updated {updatedFormat.format(new Date(vm.freshnessAtMs))}
        </p>
      )}
      {vm.dueFollowUps.length > 0 && (
        <section aria-label="Questions" className={styles.section}>
          <h2>Questions for you</h2>
          <List>
            {vm.dueFollowUps.map((followUp) => (
              <ListItem
                key={followUp.id}
                title={followUp.question}
                trailing={
                  <Link
                    href={CHAT_PATH}
                    className={`mt-button mt-button--text ${styles.linkButton ?? ""}`}
                  >
                    Open
                  </Link>
                }
              />
            ))}
          </List>
        </section>
      )}
      <Link href={CHAT_PATH} className={styles.chatEntry}>
        Paste a bank SMS or describe cash
      </Link>
    </main>
  );
}
