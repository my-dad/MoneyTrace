import { Button } from "@moneytrace/ui-kit";
import type { Commands } from "../../shared/commands";
import type { AccountRow } from "../../shared/read-model-gateway";
import type { ChatItem, ChatOutcome } from "./chat-view-model";
import { CHAT_COPY } from "./chat-copy";
import styles from "./chat.module.css";
import { TransactionPreview } from "./TransactionPreview";
import { useAction } from "./use-action";

type EvidenceItem = Extract<ChatItem, { kind: "evidence" }>;

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
  commands: Pick<Commands, "confirmCandidate" | "retrySourceEvent" | "cancelSourceEvent">;
}) {
  const { event } = item;
  const { busy, failed, run } = useAction();
  const unknown = event.status === "pending" && event.pendingReason === "providerOutcomeUnknown";
  const quota = event.status === "pending" && event.pendingReason === "aiQuotaExhausted";
  const awaiting = event.status === "pending" && event.pendingReason === "awaitingClarification";

  return (
    <>
      <div className={styles.bubble}>
        <span className={styles.bubbleLabel}>
          {event.sourceType === "sms" ? "Pasted SMS" : "Your note"}
        </span>
        <p className={styles.bubbleText}>{item.text}</p>
        <span className={styles.bubbleTime}>{timeFormat.format(new Date(event.receivedAtMs))}</span>
      </div>
      <div className={styles.reply}>
        {awaiting && (
          <TransactionPreview
            event={event}
            accounts={accounts}
            confirmCandidate={commands.confirmCandidate}
          />
        )}
        <OutcomeLine outcome={item.outcome} copy={item.statusCopy} />
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
