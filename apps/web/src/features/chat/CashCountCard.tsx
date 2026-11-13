import { formatBdt } from "@moneytrace/contracts";
import { Button, FormField } from "@moneytrace/ui-kit";
import { useRef, useState } from "react";
import type { Commands, CommandResponse } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { CashGapActions, signedBdt } from "./CashGapActions";
import styles from "./chat.module.css";

type Count = CommandResponse<"recordReconciliation">;

/** Count my cash (mockup I1–I2): ask, compare, show any gap. Nothing changes a balance here. */
export function CashCountCard({
  commands,
  onRecorded,
  onTellMe,
}: {
  commands: Pick<Commands, "recordReconciliation" | "recordAdjustment">;
  /** The count's stored question, which this card shows in its place. */
  onRecorded: (followUpId: string | null) => void;
  onTellMe: () => void;
}) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [count, setCount] = useState<Count | null>(null);
  const { busy, failed, unavailable, run } = useAction();
  // Survives a failed check, so asking again with the same amount can't store two counts.
  const attempt = useRef<{ minor: number; key: string } | null>(null);

  function check() {
    const minor = parseBdtInput(text, { allowZero: true });
    setInvalid(minor === null);
    if (minor === null) return;
    const current = attempt.current?.minor === minor ? attempt.current : { minor, key: crypto.randomUUID() };
    attempt.current = current;
    void run(async () => {
      const result = await commands.recordReconciliation({
        idempotencyKey: current.key,
        countedMinor: current.minor,
        currency: "BDT",
      });
      setCount(result);
      onRecorded(result.followUpId ?? null);
    });
  }

  return (
    <section role="group" aria-label={CHAT_COPY.countLabel} className={styles.question}>
      {count === null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            check();
          }}
        >
          <p className={styles.questionTitle}>{CHAT_COPY.countQuestion}</p>
          <p className={styles.note}>{CHAT_COPY.countHint}</p>
          <div className={styles.countRow}>
            <FormField label={CHAT_COPY.countAmount}>
              {(control) => (
                <input
                  {...control}
                  inputMode="decimal"
                  autoComplete="off"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                />
              )}
            </FormField>
            <Button type="submit" disabled={busy}>
              {CHAT_COPY.countCheck}
            </Button>
          </div>
          {invalid && (
            <p role="alert" className={styles.error}>
              {CHAT_COPY.countInvalid}
            </p>
          )}
          {failed && (
            <p role="alert" className={styles.error}>
              {unavailable ? COPY.demoUnavailable : CHAT_COPY.countFailed}
            </p>
          )}
        </form>
      ) : count.differenceMinor === 0 ? (
        <p role="status" className={styles.note}>
          {CHAT_COPY.countMatches(formatBdt(count.countedMinor))}
        </p>
      ) : (
        <>
          <p className={styles.questionTitle}>
            {count.differenceMinor < 0
              ? CHAT_COPY.gapShort(formatBdt(-count.differenceMinor))
              : CHAT_COPY.gapOver(formatBdt(count.differenceMinor))}
          </p>
          <dl className={styles.sum}>
            {(
              [
                [CHAT_COPY.gapCash, formatBdt(count.cashMinor)],
                [CHAT_COPY.gapUnexplained, formatBdt(count.unexplainedMinor)],
                [CHAT_COPY.gapExpected, formatBdt(count.expectedMinor)],
                [CHAT_COPY.gapCounted, formatBdt(count.countedMinor)],
                [CHAT_COPY.gapDifference, signedBdt(count.differenceMinor)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.note}>{CHAT_COPY.gapNote}</p>
          <CashGapActions
            reconciliationId={count.reconciliationId}
            amounts={{ countedMinor: count.countedMinor, differenceMinor: count.differenceMinor }}
            recordAdjustment={commands.recordAdjustment}
            onTellMe={onTellMe}
          />
        </>
      )}
    </section>
  );
}
