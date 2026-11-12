"use client";

import { formatBdt } from "@moneytrace/contracts";
import { Button, EmptyState } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ACCOUNTS_COPY } from "../../shared/copy";
import type { AccountRow, BalanceRow, ReadModelGateway } from "../../shared/read-model-gateway";
import { AccountDetail } from "./AccountDetail";
import { AllocationForm } from "./AllocationForm";
import styles from "./accounts-home.module.css";
import { accountTotals, dueLabel, groupAccounts, type AccountView } from "./accounts-view-model";
import type { CashSource } from "./cash-source";
import { CashCountFlow } from "./CashCountFlow";

const ICON: Record<AccountRow["kind"], string> = { bank: "🏦", cash: "👛", familyCash: "👤", creditLiability: "💳" };
const ADD_ACCOUNT_PATH = "/accounts/new";
/** Desktop columns, as in the approved mockup: banks and cards left, cash and family right. */
const COLUMNS: AccountRow["kind"][][] = [["bank", "creditLiability"], ["cash", "familyCash"]];

/** Row subtitles that come from the cash source: a bank's linked instrument, a card's due date. */
function useSubtitles(source: CashSource | null, rows: AccountView[]): Record<string, string> {
  const [subtitles, setSubtitles] = useState<Record<string, string>>({});
  const key = rows.map((row) => row.id).join(",");
  useEffect(() => {
    if (source === null) return;
    let live = true;
    const ids = key === "" ? [] : key.split(",");
    void Promise.all(
      ids.map(async (id): Promise<[string, string | null]> => {
        const due = await source.cardDue(id);
        if (due !== null) return [id, ACCOUNTS_COPY.due(dueLabel(due.dueDate))];
        const first = (await source.instruments(id))[0];
        if (first === undefined) return [id, null];
        return [id, first.masked === "" ? first.label : `${first.label} ••${first.masked}`];
      }),
    )
      .then((pairs) => {
        if (live) setSubtitles(Object.fromEntries(pairs.filter((pair): pair is [string, string] => pair[1] !== null)));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [source, key]);
  return subtitles;
}

export function AccountsHome({
  gateway,
  source,
  selectedId,
  onSelect,
}: {
  gateway: ReadModelGateway;
  source: CashSource | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [flow, setFlow] = useState<"count" | "give" | null>(null);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const stops = [gateway.watchAccounts(setAccounts, onError), gateway.watchBalances(setBalances, onError)];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, attempt]);

  const groups = useMemo(() => (accounts === null || balances === null ? [] : groupAccounts(accounts, balances)), [accounts, balances]);
  const rows = groups.flatMap((group) => group.rows);
  const subtitles = useSubtitles(source, rows);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const totals = accountTotals(groups);
  const cash = rows.filter((row) => row.kind === "cash");
  const family = rows.filter((row) => row.kind === "familyCash");
  const loaded = !failed && accounts !== null && balances !== null;

  let body;
  if (failed) {
    body = (
      <div role="alert" className={styles.alert}>
        <span>{ACCOUNTS_COPY.readFailed}</span>
        <Button variant="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>{ACCOUNTS_COPY.retry}</Button>
      </div>
    );
  } else if (!loaded) {
    body = <p role="status" className={styles.caption}>{ACCOUNTS_COPY.loading}</p>;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        title={ACCOUNTS_COPY.emptyTitle}
        description={ACCOUNTS_COPY.emptyBody}
        action={<Link href={ADD_ACCOUNT_PATH} className="mt-button mt-button--primary">{ACCOUNTS_COPY.addAccount}</Link>}
      />
    );
  } else {
    body = (
      <>
        <div className={styles.groups}>
          {COLUMNS.map((kinds) => (
            <div key={kinds.join()} className={styles.column}>
              {groups.filter((group) => kinds.includes(group.kind)).map((group) => (
                <section key={group.kind} aria-labelledby={`group-${group.kind}`} className={styles[`order-${group.kind}`]}>
                  <div className={styles.groupHead}>
                    <h2 id={`group-${group.kind}`}>{group.title}</h2>
                    <span>{formatBdt(group.totalMinor)}</span>
                  </div>
                  <ul className={styles.list}>
                    {group.rows.map((row) => {
                      const subtitle = row.unexplained ? ACCOUNTS_COPY.unexplainedSub : subtitles[row.id];
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={`${styles.row ?? ""} ${row.unexplained ? (styles.unexplained ?? "") : ""} ${row.id === selectedId ? (styles.selected ?? "") : ""}`}
                            onClick={() => { onSelect(row.id); }}
                            {...(row.id === selectedId ? { "aria-current": "true" as const } : {})}
                          >
                            <span className={styles.icon} aria-hidden="true">{row.unexplained ? "?" : ICON[row.kind]}</span>
                            <span className={styles.rowText}>
                              <span className={styles.rowTitle}>{row.unexplained ? ACCOUNTS_COPY.unexplainedTitle : row.name}</span>
                              {subtitle !== undefined && <span className={styles.rowSub}>{subtitle}</span>}
                            </span>
                            <span className={styles.rowAmount}>
                              <span>{formatBdt(row.amountMinor)}</span>
                              {row.kind === "creditLiability" && <span className={styles.owed}>{ACCOUNTS_COPY.owed}</span>}
                              {row.unexplained && <span className={`${styles.badge ?? ""} ${styles.needsAnswer ?? ""}`}>{ACCOUNTS_COPY.needsAnswer}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {group.kind === "creditLiability" && <p className={styles.note}>{ACCOUNTS_COPY.cardsNote}</p>}
                </section>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <Link href={ADD_ACCOUNT_PATH} className="mt-button mt-button--primary">{ACCOUNTS_COPY.addAccount}</Link>
          {source !== null && cash.length > 0 && <Button variant="secondary" onClick={() => { setFlow("count"); }}>{ACCOUNTS_COPY.countCash}</Button>}
          {source !== null && cash.length > 0 && family.length > 0 && (
            <Button variant="secondary" onClick={() => { setFlow("give"); }}>{ACCOUNTS_COPY.giveCash}</Button>
          )}
        </div>
      </>
    );
  }

  return (
    <main className={`${styles.page ?? ""} ${selected === null ? "" : (styles.hasDetail ?? "")}`}>
      <section aria-label="Accounts list" className={styles.listPane}>
        <h1 className={styles.title}>{ACCOUNTS_COPY.title}</h1>
        {loaded && rows.length > 0 && (
          <p className={styles.caption}>{ACCOUNTS_COPY.totals(formatBdt(totals.availableMinor), formatBdt(totals.owedMinor))}</p>
        )}
        {body}
      </section>
      {selected !== null && (
        <section aria-label="Account detail" className={styles.detailPane}>
          <AccountDetail account={selected} source={source} onBack={() => { onSelect(null); }} />
        </section>
      )}
      {source !== null && flow === "count" && (
        <CashCountFlow accounts={cash.filter((row) => !row.unexplained)} source={source} onClose={() => { setFlow(null); }} />
      )}
      {source !== null && flow === "give" && (
        <AllocationForm from={cash} to={family} source={source} onClose={() => { setFlow(null); }} />
      )}
    </main>
  );
}
