"use client";

import { formatBdt } from "@moneytrace/contracts";
import { useEffect, useRef, useState } from "react";
import { WELCOME_COPY } from "../../shared/copy";
import { dhakaDayLabel } from "../../shared/dhaka-date";
import type { BalanceRow, LedgerEntryRow, ReadModelGateway } from "../../shared/read-model-gateway";
import { useModalFocus } from "../../shared/use-modal-focus";
import { useChatOpener } from "../chat/ChatLauncher";
import { SYSTEM_CASH_ACCOUNT_ID } from "../dashboard/dashboard-view-model";
import styles from "./welcome.module.css";

const DAY_MS = 86_400_000;
/** Dhaka (UTC+6, no daylight saving) calendar day number. */
const dhakaDay = (ms: number): number => Math.floor((ms + 6 * 3_600_000) / DAY_MS);
const net = (rows: LedgerEntryRow[], positive: "debit" | "credit"): number =>
  rows.reduce((sum, r) => sum + (r.side === positive ? r.amountMinor : -r.amountMinor), 0);

/**
 * Once per visit, when the last visit was on an earlier Dhaka day: how long you were away, what was
 * recorded since, and what needs you now. Figures are the ledger's; nothing here is assumed.
 */
export function WelcomeBack({
  gateway,
  nowMs,
  name,
  recordVisit,
}: {
  gateway: ReadModelGateway;
  nowMs: number;
  name: string;
  recordVisit: () => Promise<{ previousSeenAtMs: number | null }>;
}) {
  const [since, setSince] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const asked = useRef(false);
  const chat = useChatOpener();

  useEffect(() => {
    // Noted once per visit, even if this renders again (or twice in development).
    if (asked.current) return;
    asked.current = true;
    recordVisit().then(
      ({ previousSeenAtMs }) => {
        if (previousSeenAtMs !== null && dhakaDay(previousSeenAtMs) < dhakaDay(nowMs)) {
          setSince(previousSeenAtMs);
          setOpen(true);
        }
      },
      () => undefined, // Couldn't note the visit: say nothing rather than guess.
    );
  }, [recordVisit, nowMs]);

  if (!open || since === null) return null;
  return <Overview gateway={gateway} nowMs={nowMs} since={since} name={name} waiting={chat?.waiting ?? 0} onChat={chat?.openChat} onClose={() => { setOpen(false); }} />;
}

function Overview({
  gateway,
  nowMs,
  since,
  name,
  waiting,
  onChat,
  onClose,
}: {
  gateway: ReadModelGateway;
  nowMs: number;
  since: number;
  name: string;
  waiting: number;
  onChat: ((start?: "cashCount" | "paste") => void) | undefined;
  onClose: () => void;
}) {
  const focus = useModalFocus(onClose);
  const [spent, setSpent] = useState<LedgerEntryRow[] | null>(null);
  const [cameIn, setCameIn] = useState<LedgerEntryRow[] | null>(null);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  useEffect(() => {
    const stops = [
      gateway.watchExpenseEntries(since + 1, nowMs, setSpent),
      gateway.watchIncomeEntries(since + 1, nowMs, setCameIn),
      gateway.watchBalances(setBalances),
    ];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, since, nowMs]);

  const days = dhakaDay(nowMs) - dhakaDay(since);
  const first = name.trim().split(/\s+/)[0] ?? "";
  const unexplained = Math.max(0, balances?.find((b) => b.accountId === SYSTEM_CASH_ACCOUNT_ID)?.debitMinusCreditMinor ?? 0);
  const go = (start?: "cashCount" | "paste") => {
    onClose();
    if (start === undefined) onChat?.();
    else onChat?.(start);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={focus.ref} role="dialog" aria-modal="true" aria-labelledby="welcome-title" tabIndex={-1} className={styles.card} onKeyDown={focus.onKeyDown} onClick={(e) => { e.stopPropagation(); }}>
        <h2 id="welcome-title" className={styles.title}>{WELCOME_COPY.title(first)}</h2>
        <p className={styles.away}>{WELCOME_COPY.away(days, dhakaDayLabel(since))}</p>
        <ul className={styles.items}>
          {spent !== null && cameIn !== null && (
            <li className={styles.item}>
              <span className={styles.icon} aria-hidden="true">৳</span>
              <span>
                {net(spent, "debit") === 0 && net(cameIn, "credit") === 0
                  ? WELCOME_COPY.nothingNew
                  : WELCOME_COPY.moneySince(formatBdt(Math.max(0, net(spent, "debit"))), formatBdt(Math.max(0, net(cameIn, "credit"))))}
              </span>
            </li>
          )}
          {waiting > 0 && onChat !== undefined && (
            <li className={`${styles.item ?? ""} ${styles.attention ?? ""}`}>
              <span className={styles.icon} aria-hidden="true">?</span>
              <span>{WELCOME_COPY.waiting(waiting)}</span>
              <button type="button" className={styles.action} onClick={() => { go(); }}>{WELCOME_COPY.answerNow}</button>
            </li>
          )}
          {unexplained > 0 && onChat !== undefined && (
            <li className={styles.item}>
              <span className={styles.icon} aria-hidden="true">◌</span>
              <span>{WELCOME_COPY.unexplained(formatBdt(unexplained))}</span>
              <button type="button" className={styles.action} onClick={() => { go("cashCount"); }}>{WELCOME_COPY.countCash}</button>
            </li>
          )}
          {days >= 2 && onChat !== undefined && (
            <li className={styles.item}>
              <span className={styles.icon} aria-hidden="true">✉</span>
              <span>{WELCOME_COPY.pasteMissed(dhakaDayLabel(since))}</span>
              <button type="button" className={styles.action} onClick={() => { go("paste"); }}>{WELCOME_COPY.paste}</button>
            </li>
          )}
        </ul>
        <button type="button" className={styles.close} onClick={onClose}>{WELCOME_COPY.gotIt}</button>
      </div>
    </div>
  );
}
