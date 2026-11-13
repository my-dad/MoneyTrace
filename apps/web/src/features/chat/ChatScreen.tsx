"use client";

import { MAX_EVIDENCE_TEXT_CHARS } from "@moneytrace/contracts";
import { Chip, Composer } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Commands } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import type {
  AccountRow,
  FollowUpRow,
  ReadModelGateway,
  SourceEventRow,
} from "../../shared/read-model-gateway";
import { buildChatTimeline } from "./chat-view-model";
import styles from "./chat.module.css";
import { EvidenceBubble } from "./EvidenceBubble";
import { QuestionCard } from "./QuestionCard";
import { CashCountCard } from "./CashCountCard";
import { CashGapActions } from "./CashGapActions";
import { useOnlineStatus } from "../shell/OfflineBanner";

export type ChatCommands = Pick<
  Commands,
  | "submitEvidence"
  | "confirmCandidate"
  | "resolveFollowUp"
  | "retrySourceEvent"
  | "cancelSourceEvent"
  | "answerQuestion"
  | "recordReconciliation"
  | "recordAdjustment"
>;

const EVENT_LIMIT = 50;

/** Outcomes the server may have completed even though the reply never arrived. */
const UNCERTAIN_CODES = new Set([
  "functions/unavailable",
  "functions/deadline-exceeded",
  "functions/internal",
  "functions/unknown",
  "functions/cancelled",
]);

function sendFailureCopy(error: unknown): string {
  if (error instanceof DemoUnavailableError) return COPY.demoUnavailable;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  if (message === "sensitiveEvidence") return COPY.otpRefused;
  if (typeof code === "string" && code.startsWith("functions/") && !UNCERTAIN_CODES.has(code)) {
    return CHAT_COPY.sendRefused;
  }
  return CHAT_COPY.sendUncertain;
}

export function ChatScreen({
  gateway,
  commands,
  embedded = false,
  nowMs: givenNowMs,
  startWith,
}: {
  gateway: ReadModelGateway;
  commands: ChatCommands;
  /** Inside the pop-up panel, which supplies its own title bar. */
  embedded?: boolean;
  nowMs?: number;
  /** Open on the cash count, as the dashboard's "Count my cash" does. */
  startWith?: "cashCount";
}) {
  const [nowMs] = useState(() => givenNowMs ?? Date.now());
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [events, setEvents] = useState<SourceEventRow[]>([]);
  const [readFailed, setReadFailed] = useState(false);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ id: string; duplicate: boolean } | null>(null);
  const online = useOnlineStatus();
  // Survives a failed send, so resending the same text can't record it twice.
  const attempt = useRef<{ text: string; key: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  // Each "Count my cash" starts a fresh card; null means no card is shown.
  const [countCard, setCountCard] = useState<number | null>(startWith === "cashCount" ? 0 : null);
  // The just-made count's question is shown by its card, not again from the follow-ups.
  const [shownFollowUpId, setShownFollowUpId] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState<string>(CHAT_COPY.composerPlaceholder);

  function tellMe() {
    setPlaceholder(CHAT_COPY.tellMePlaceholder);
    composerRef.current?.querySelector("textarea")?.focus();
  }

  useEffect(() => {
    const onError = () => {
      setReadFailed(true);
    };
    const stops = [
      gateway.watchAccounts(setAccounts, onError),
      gateway.watchFollowUps(setFollowUps, onError),
      gateway.watchSourceEvents(EVENT_LIMIT, setEvents, onError),
    ];
    return () => {
      stops.forEach((stop) => {
        stop();
      });
    };
  }, [gateway]);

  const timeline = useMemo(
    () =>
      buildChatTimeline({ events, followUps, accounts, nowMs }).filter(
        (item) => item.kind !== "followUp" || item.id !== shownFollowUpId,
      ),
    [events, followUps, accounts, nowMs, shownFollowUpId],
  );

  useEffect(() => {
    const log = logRef.current;
    if (log !== null) log.scrollTop = log.scrollHeight;
  }, [timeline.length, sending, countCard]);

  async function send() {
    if (text.length > MAX_EVIDENCE_TEXT_CHARS) {
      setSendError(CHAT_COPY.tooLong);
      return;
    }
    const current =
      attempt.current?.text === text ? attempt.current : { text, key: crypto.randomUUID() };
    attempt.current = current;
    setSending(true);
    setSendError(null);
    setAccepted(null);
    try {
      const response = await commands.submitEvidence({
        idempotencyKey: current.key,
        text: current.text,
      });
      attempt.current = null;
      setText("");
      setAccepted({ id: response.sourceEventId, duplicate: response.duplicate });
    } catch (error) {
      setSendError(sendFailureCopy(error));
    } finally {
      setSending(false);
    }
  }

  const awaitingListener =
    accepted !== null && !accepted.duplicate && !events.some((event) => event.id === accepted.id);

  return (
    <div className={`${styles.screen ?? ""} ${embedded ? (styles.embedded ?? "") : ""}`}>
      {!embedded && <header className={styles.header}>
        <Link href="/" aria-label={CHAT_COPY.backToHome} className={styles.back}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span aria-hidden="true" className={styles.mark}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F3B585"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 16l5-5 4 4 7-8" />
          </svg>
        </span>
        <div className={styles.headerText}>
          <h1>MoneyTrace</h1>
          <span>{CHAT_COPY.subtitle}</span>
        </div>
      </header>}

      {readFailed && (
        <p role="alert" className={styles.banner}>
          {CHAT_COPY.readFailed}
        </p>
      )}

      <div ref={logRef} role="log" aria-label={CHAT_COPY.conversation} aria-live="polite" className={styles.log}>
        {timeline.length === 0 && !sending && accepted === null && (
          <p className={styles.welcome}>{CHAT_COPY.welcome}</p>
        )}
        {timeline.map((item) =>
          item.kind === "evidence" ? (
            <EvidenceBubble key={item.id} item={item} accounts={accounts} commands={commands} />
          ) : item.followUp.trigger === "reconciliationDifference" ? (
            <fieldset key={item.id} className={styles.question}>
              <legend className={styles.questionTitle}>{item.followUp.question}</legend>
              <CashGapActions
                reconciliationId={item.followUp.targetReconciliationId ?? null}
                amounts={null}
                recordAdjustment={commands.recordAdjustment}
                onTellMe={tellMe}
              />
            </fieldset>
          ) : (
            <QuestionCard
              key={item.id}
              followUp={item.followUp}
              accounts={item.accounts}
              resolveFollowUp={commands.resolveFollowUp}
            />
          ),
        )}
        {countCard !== null && (
          <CashCountCard key={countCard} commands={commands} onRecorded={setShownFollowUpId} onTellMe={tellMe} />
        )}
        {sending && (
          <p role="status" className={styles.note}>
            {CHAT_COPY.sending}
          </p>
        )}
        {awaitingListener && (
          <p role="status" className={styles.note}>
            {CHAT_COPY.received}
          </p>
        )}
        {accepted?.duplicate === true && (
          <p role="status" className={styles.note}>
            {CHAT_COPY.alreadyReceived}
          </p>
        )}
      </div>

      <div ref={composerRef} className={styles.composer}>
        <div className={styles.quick}>
          <Chip
            onClick={() => {
              setCountCard((n) => (n ?? 0) + 1);
            }}
          >
            {CHAT_COPY.countCash}
          </Chip>
        </div>
        {sendError !== null && (
          <p role="alert" className={styles.error}>
            {sendError}
          </p>
        )}
        <Composer
          value={text}
          onChange={setText}
          onSend={() => {
            void send();
          }}
          disabled={sending || !online}
          label={CHAT_COPY.composerLabel}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
