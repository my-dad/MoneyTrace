import { Button } from "@moneytrace/ui-kit";
import type { Commands } from "../../shared/commands";
import type { AccountRow } from "../../shared/read-model-gateway";
import type { ChatItem, ChatOutcome } from "./chat-view-model";
import { CHAT_COPY } from "../../shared/copy";
import styles from "./chat.module.css";
import { TransactionPreview } from "./TransactionPreview";
import { QuestionThread } from "./QuestionThread";
import { SplitTransferPanel } from "./SplitTransferPanel";
import { toRecentItems } from "../dashboard/recent-items";
import { useAction } from "../../shared/use-action";

type EvidenceItem = Extract<ChatItem, { kind: "evidence" }>;

/** Split by "Not a transfer": no longer paired, still pointing at the reversed transfer. */
const wasSplit = (event: EvidenceItem["event"]): boolean =>
  event.matchKind === "none" && event.matchedTransactionId?.endsWith(":repl") === true;

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const OUTCOME_ICON: Record<Exclude<ChatOutcome, "reading">, React.ReactNode> = {
  recorded: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  noChange: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  waiting: <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />,
  failed: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
};

function OutcomeLine({ outcome, copy }: { outcome: ChatOutcome; copy: string }) {
  const [lead, ...rest] = copy.split(" · ");
  return (
    <div role="status" className={`${styles.outcome ?? ""} ${styles[outcome] ?? ""}`}>
      {outcome === "reading" ? (
        <span aria-hidden="true" className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {OUTCOME_ICON[outcome]}
        </svg>
      )}
      <span>
        <strong>{lead}</strong>
        {rest.length > 0 && ` · ${rest.join(" · ")}`}
      </span>
    </div>
  );
}

export function EvidenceBubble({
  item,
  accounts,
  commands,
}: {
  item: EvidenceItem;
  accounts: AccountRow[];
  commands: Pick<Commands, "confirmCandidate" | "retrySourceEvent" | "cancelSourceEvent" | "answerQuestion" | "splitTransfer">;
}) {
  const { event } = item;
  const { busy, failed, run } = useAction();
  const unknown = event.status === "pending" && event.pendingReason === "providerOutcomeUnknown";
  const quota = event.status === "pending" && event.pendingReason === "aiQuotaExhausted";
  const awaiting = event.status === "pending" && event.pendingReason === "awaitingClarification";
  // The source(s) as chips, the same as the dashboard's Recent list (CR-008).
  const chips = toRecentItems([event], accounts, 1)[0]?.chips ?? [];

  return (
    <>
      <div className={styles.bubble}>
        <span className={styles.bubbleLabel}>
          {event.sourceType === "sms" ? CHAT_COPY.pastedSms : CHAT_COPY.yourNote}
        </span>
        <p className={styles.bubbleText}>{item.text}</p>
        <span className={styles.bubbleTime}>{timeFormat.format(new Date(event.receivedAtMs))}</span>
      </div>
      <div className={styles.reply}>
        {event.clarifications.length > 0 && <QuestionThread event={event} answerQuestion={commands.answerQuestion} />}
        {awaiting && (
          <TransactionPreview
            event={event}
            accounts={accounts}
            confirmCandidate={commands.confirmCandidate}
          />
        )}
        <OutcomeLine outcome={item.outcome} copy={item.statusCopy} />
        {item.outcome === "recorded" && chips.length > 0 && (
          <span className={styles.chips}>
            {chips.map((chip, index) => <span key={`${chip}-${String(index)}`} className={styles.chip}>{chip}</span>)}
          </span>
        )}
        {/* A split message stays mounted, so its done line survives the server's update. */}
        {item.outcome === "recorded" && (event.matchKind === "transferCounterpart" || wasSplit(event)) && (
          <SplitTransferPanel event={event} accounts={accounts} splitTransfer={commands.splitTransfer} />
        )}
        {(unknown || quota) && (
          <>
            {unknown && <p className={styles.note}>{CHAT_COPY.secondCharge}</p>}
            <div className={styles.actions}>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void run(() => commands.cancelSourceEvent({ sourceEventId: event.id }));
                }}
              >
                {CHAT_COPY.cancel}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void run(() => commands.retrySourceEvent({ sourceEventId: event.id }));
                }}
              >
                {CHAT_COPY.retry}
              </Button>
            </div>
            {failed && (
              <p role="alert" className={styles.error}>
                {CHAT_COPY.retryFailed}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
