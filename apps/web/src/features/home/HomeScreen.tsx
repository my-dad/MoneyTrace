"use client";

import { formatBdt } from "@moneytrace/contracts";
import { Button, Card, EmptyState, List, ListItem, MoneyText } from "@moneytrace/ui-kit";
import { useEffect, useMemo, useState } from "react";
import type { ReadModelGateway } from "../../shared/read-model-gateway";
import { buildHomeViewModel, monthRangeInZone } from "./home-view-model";
import styles from "./home.module.css";

export function HomeScreen({
  gateway,
  displayName,
  onAddAccount,
}: {
  gateway: ReadModelGateway;
  displayName?: string;
  onAddAccount?: () => void;
}) {
  const [accounts, setAccounts] = useState<import("../../shared/read-model-gateway").AccountRow[]>(
    [],
  );
  const [balances, setBalances] = useState<import("../../shared/read-model-gateway").BalanceRow[]>(
    [],
  );
  const [followUps, setFollowUps] = useState<
    import("../../shared/read-model-gateway").FollowUpRow[]
  >([]);
  const [expenses, setExpenses] = useState<
    import("../../shared/read-model-gateway").ExpenseEntryRow[]
  >([]);
  const [failed, setFailed] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const nowMs = useMemo(() => Date.now(), []);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const range = monthRangeInZone(nowMs, "Asia/Dhaka");
    const stops = [
      gateway.watchAccounts(setAccounts, onError),
      gateway.watchBalances(setBalances, onError),
      gateway.watchFollowUps(setFollowUps, onError),
      gateway.watchExpenseEntries(range.fromMs, range.toMs, setExpenses, onError),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, nowMs]);

  const vm = useMemo(
    () => buildHomeViewModel({ accounts, balances, followUps, expenseEntries: expenses, nowMs }),
    [accounts, balances, followUps, expenses, nowMs],
  );
  const noAccounts = accounts.filter((account) => account.id !== "cash-unassigned").length === 0;

  if (noAccounts) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <span className={styles.logo}>MoneyTrace</span>
          <span>{displayName ?? ""}</span>
        </header>
        <EmptyState
          title="Let's set up your first account"
          description="Add an account and its opening balance so your available money starts from a real number."
          action={<Button onClick={onAddAccount}>Add account</Button>}
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
        <a href="/accounts">Accounts</a>
      </header>
      {failed && (
        <p role="alert" className={styles.alert}>
          Couldn&apos;t load your latest money picture. The figures below may be out of date.
        </p>
      )}
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
            <p>This money is safe in your total, but needs a place.</p>
          </div>
          <Button variant="secondary" onClick={() => { setShowQuestions(true); }}>
            Explain
          </Button>
        </Card>
      )}
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>Spending this month</h2>
          <MoneyText text={formatBdt(vm.spendingThisMonthMinor)} />
        </div>
        <p className={styles.freshness}>Updated just now</p>
      </section>
      {(showQuestions || vm.dueFollowUps.length > 0) && (
        <section aria-label="Questions" className={styles.section}>
          <h2>Questions for you</h2>
          <List>
            {vm.dueFollowUps.map((followUp) => (
              <ListItem
                key={followUp.id}
                title={followUp.question}
                trailing={
                  <Button variant="text" onClick={() => { setShowQuestions(true); }}>
                    Open
                  </Button>
                }
              />
            ))}
          </List>
          {showQuestions && vm.dueFollowUps.length === 0 && <p>No question is ready yet.</p>}
        </section>
      )}
    </main>
  );
}
