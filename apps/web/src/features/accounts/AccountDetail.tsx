import { formatBdt } from "@moneytrace/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ACCOUNTS_COPY, COPY } from "../../shared/copy";
import { dhakaDayLabel } from "../../shared/dhaka-date";
import styles from "./accounts-home.module.css";
import { dueLabel, type AccountView } from "./accounts-view-model";
import type { CardDue, CashSource, HistoryItem, InstrumentView } from "./cash-source";

type Details = { instruments: InstrumentView[]; history: HistoryItem[]; due: CardDue | null };

const instrumentText = (instrument: InstrumentView) =>
  instrument.masked === "" ? instrument.label : `${instrument.label} ••${instrument.masked}`;

const historyAmount = (item: HistoryItem) => `${item.direction === "in" ? "+" : ""}${formatBdt(item.amountMinor)}`;

export function AccountDetail({ account, source, onBack }: { account: AccountView; source: CashSource | null; onBack: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [failed, setFailed] = useState(false);
  const card = account.kind === "creditLiability";

  useEffect(() => {
    if (source === null) return;
    let live = true;
    setDetails(null);
    setFailed(false);
    Promise.all([source.instruments(account.id), source.history(account.id), source.cardDue(account.id)])
      .then(([instruments, history, due]) => { if (live) setDetails({ instruments, history, due }); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [source, account.id]);

  return (
    <article>
      <div className={styles.detailBar}>
        <button type="button" className={styles.back} onClick={onBack} aria-label={ACCOUNTS_COPY.back}>‹</button>
        <span>{account.unexplained ? ACCOUNTS_COPY.unexplainedTitle : account.name}</span>
      </div>
      <div className={styles.hero}>
        <p className={styles.caption}>{card ? ACCOUNTS_COPY.youOwe : ACCOUNTS_COPY.balance}</p>
        <p className={styles.big}>{formatBdt(account.amountMinor)}</p>
        {account.unexplained && <span className={`${styles.badge ?? ""} ${styles.needsAnswer ?? ""}`}>{ACCOUNTS_COPY.needsAnswer}</span>}
        {details?.due != null && <p className={styles.caption}>{ACCOUNTS_COPY.statementDue(dueLabel(details.due.dueDate), formatBdt(details.due.statementOwedMinor))}</p>}
      </div>

      {card && (
        <p className={styles.info}>
          {ACCOUNTS_COPY.repaymentInfo} <b>{ACCOUNTS_COPY.repaymentNotExpense}</b>{ACCOUNTS_COPY.repaymentTail}
        </p>
      )}
      {account.unexplained && (
        <>
          <p className={styles.info}>{ACCOUNTS_COPY.unexplainedInfo}</p>
          <Link href="/chat" className="mt-button mt-button--primary">{ACCOUNTS_COPY.answerInChat}</Link>
        </>
      )}

      {source === null ? (
        <div className={styles.card}><p>{COPY.notAvailableYet}</p></div>
      ) : failed ? (
        <div role="alert" className={styles.alert}>{ACCOUNTS_COPY.detailsFailed}</div>
      ) : (
        details !== null && (
          <>
            {details.instruments.length > 0 && !card && (
              <div className={styles.card}>
                <h2>{ACCOUNTS_COPY.linked}</h2>
                {details.instruments.map((instrument) => (
                  <div key={instrument.id} className={styles.pill}>
                    <span>{instrumentText(instrument)}</span>
                    {instrument.kind === "debitCard" && <span>{ACCOUNTS_COPY.spendsFrom}</span>}
                  </div>
                ))}
                {details.instruments.some((instrument) => instrument.kind === "debitCard") && <p className={styles.caption}>{ACCOUNTS_COPY.debitNote}</p>}
              </div>
            )}
            <div className={styles.card}>
              <h2>{ACCOUNTS_COPY.recent}</h2>
              {details.history.length === 0 ? (
                <p className={styles.caption}>{ACCOUNTS_COPY.noRecent}</p>
              ) : (
                <ul>
                  {details.history.map((item) => (
                    <li key={item.id} className={styles.kv}>
                      <span>{`${dhakaDayLabel(item.occurredAtMs)} · ${item.title}${item.status === "Verified" ? "" : ` · ${item.status}`}`}</span>
                      <span>{historyAmount(item)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )
      )}
      <div className={styles.actions}>
        <Link href="/activity" className="mt-button mt-button--secondary">{ACCOUNTS_COPY.seeAll}</Link>
      </div>
    </article>
  );
}
