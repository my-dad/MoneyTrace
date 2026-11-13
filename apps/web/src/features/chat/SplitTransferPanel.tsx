import { formatBdt } from "@moneytrace/contracts";
import { Button } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import type { AccountRow, SourceEventRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import styles from "./chat.module.css";

/**
 * "Not a transfer?" on a message the app paired as the user's own transfer (mockup I4). The
 * debit side becomes Spent and the credit side Came in, the same sides the Transfer chips show.
 */
export function SplitTransferPanel({
  event,
  accounts,
  splitTransfer,
}: {
  event: SourceEventRow;
  accounts: AccountRow[];
  splitTransfer: Commands["splitTransfer"];
}) {
  const [open, setOpen] = useState(false);
  const [doneMinor, setDoneMinor] = useState<number | null>(null);
  const { busy, failed, unavailable, run } = useAction();
  const kind = event.candidate?.kind;
  const amountMinor = event.candidate?.amountMinor ?? 0;
  const name = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";
  const incoming = kind === "unclassifiedCredit" || kind === "income" || kind === "refund";
  const here = name(event.resolvedAccountId);
  const there = name(event.resolvedDestinationAccountId);
  const spentFrom = incoming ? there : here;
  const cameInTo = incoming ? here : there;

  if (doneMinor !== null) {
    return (
      <p role="status" className={styles.note}>
        {CHAT_COPY.splitDone(formatBdt(doneMinor))}
      </p>
    );
  }
  // Already split, and not by this panel: nothing more to offer.
  if (event.matchKind !== "transferCounterpart") return null;
  if (!open) {
    return (
      <div className={styles.actions}>
        <Button
          variant="text"
          onClick={() => {
            setOpen(true);
          }}
        >
          {CHAT_COPY.splitOpen}
        </Button>
      </div>
    );
  }
  return (
    <section role="group" aria-label={CHAT_COPY.splitTitle} className={styles.question}>
      <p className={styles.questionTitle}>{CHAT_COPY.splitTitle}</p>
      <dl className={styles.sum}>
        <div>
          <dt>{CHAT_COPY.splitSpent(spentFrom)}</dt>
          <dd>{formatBdt(amountMinor)}</dd>
        </div>
        <div>
          <dt>{CHAT_COPY.splitCameIn(cameInTo)}</dt>
          <dd>{formatBdt(amountMinor)}</dd>
        </div>
      </dl>
      <p className={styles.note}>{CHAT_COPY.splitNote}</p>
      <div className={styles.actions}>
        <Button
          disabled={busy}
          onClick={() => {
            void run(async () => {
              const result = await splitTransfer({ sourceEventId: event.id });
              setDoneMinor(result.amountMinor);
            });
          }}
        >
          {CHAT_COPY.splitYes}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setOpen(false);
          }}
        >
          {CHAT_COPY.splitKeep}
        </Button>
      </div>
      {failed && (
        <p role="alert" className={styles.error}>
          {unavailable ? COPY.demoUnavailable : CHAT_COPY.splitFailed}
        </p>
      )}
    </section>
  );
}
