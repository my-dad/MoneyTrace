import { formatBdt } from "@moneytrace/contracts";
import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { CHAT_COPY, COPY } from "../../shared/copy";
import { useAction } from "../../shared/use-action";
import styles from "./chat.module.css";

/** `−৳700` or `+৳100`: a true minus sign, the way the mockup writes a difference. */
export const signedBdt = (minor: number): string =>
  minor < 0 ? `−${formatBdt(-minor)}` : `+${formatBdt(minor)}`;

/**
 * The three answers to a cash gap (mockup I2–I3). Adjust needs a typed reason and the count's id;
 * the amounts are known when the count was just made, and unknown for a stored question.
 */
export function CashGapActions({
  reconciliationId,
  amounts,
  recordAdjustment,
  onTellMe,
}: {
  reconciliationId: string | null;
  amounts: { countedMinor: number; differenceMinor: number } | null;
  recordAdjustment: Commands["recordAdjustment"];
  onTellMe: () => void;
}) {
  const [mode, setMode] = useState<"choices" | "adjusting" | "leftOpen">("choices");
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<{ countedMinor: number; adjustmentMinor: number } | null>(null);
  const { busy, failed, unavailable, run } = useAction();

  if (done !== null) {
    return (
      <p role="status" className={styles.note}>
        {CHAT_COPY.adjusted(formatBdt(done.countedMinor), formatBdt(done.adjustmentMinor))}
      </p>
    );
  }
  if (mode === "leftOpen") {
    return (
      <p role="status" className={styles.note}>
        {CHAT_COPY.gapLeftOpen}
      </p>
    );
  }
  if (mode === "adjusting" && reconciliationId !== null) {
    const submit = () => {
      if (reason.trim() === "") return;
      void run(async () => {
        const result = await recordAdjustment({ reconciliationId, cause: reason.trim() });
        setDone({ countedMinor: result.countedMinor, adjustmentMinor: result.adjustmentMinor });
      });
    };
    return (
      <form
        className={styles.adjust}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className={styles.questionTitle}>
          {amounts === null ? CHAT_COPY.adjustTitleUnknown : CHAT_COPY.adjustTitle(formatBdt(amounts.countedMinor))}
        </p>
        <FormField label={CHAT_COPY.adjustReason}>
          {(control) => (
            <input
              {...control}
              value={reason}
              required
              maxLength={2000}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          )}
        </FormField>
        <p className={styles.note}>
          {amounts === null
            ? CHAT_COPY.adjustNoteUnknown
            : CHAT_COPY.adjustNote(signedBdt(amounts.differenceMinor))}
        </p>
        <div className={styles.actions}>
          <Button type="submit" disabled={busy}>
            {CHAT_COPY.adjust}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setMode("choices");
            }}
          >
            {CHAT_COPY.cancel}
          </Button>
        </div>
        {failed && (
          <p role="alert" className={styles.error}>
            {unavailable ? COPY.demoUnavailable : CHAT_COPY.adjustFailed}
          </p>
        )}
      </form>
    );
  }
  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={onTellMe}>
        {CHAT_COPY.gapTellMe}
      </Button>
      {reconciliationId !== null && (
        <Button
          variant="secondary"
          onClick={() => {
            setMode("adjusting");
          }}
        >
          {CHAT_COPY.gapAdjust}
        </Button>
      )}
      <Button
        variant="text"
        onClick={() => {
          setMode("leftOpen");
        }}
      >
        {CHAT_COPY.gapLeaveOpen}
      </Button>
    </div>
  );
}
