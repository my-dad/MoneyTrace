import { formatBdt } from "@moneytrace/contracts";
import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import { ACCOUNTS_COPY } from "../../shared/copy";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./accounts-home.module.css";
import type { CashSource } from "./cash-source";

type Cause = keyof typeof ACCOUNTS_COPY.causes;
const CAUSES = Object.keys(ACCOUNTS_COPY.causes) as Cause[];

export const differenceText = (differenceMinor: number): string =>
  differenceMinor < 0 ? ACCOUNTS_COPY.less(formatBdt(-differenceMinor)) : ACCOUNTS_COPY.more(formatBdt(differenceMinor));

/**
 * Step 3 of a cash count. A difference is never treated as spending on its own:
 * it needs an explicit cause, or the count is saved and the difference left for review.
 */
export function AdjustmentForm({
  account,
  differenceMinor,
  countedMinor,
  source,
  onBack,
  onClose,
}: {
  account: { id: string; name: string };
  differenceMinor: number;
  countedMinor: number;
  source: CashSource;
  onBack: () => void;
  onClose: () => void;
}) {
  const [cause, setCause] = useState<Cause | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useAction();
  const reviewLater = cause === "reviewLater";

  function submit() {
    if (cause === null) {
      setError(ACCOUNTS_COPY.causeMissing);
      return;
    }
    setError(null);
    void action.run(() =>
      cause === "reviewLater"
        ? source.recordCashCount({ accountId: account.id, countedMinor })
        : source.recordAdjustment({ accountId: account.id, amountMinor: differenceMinor, cause, note: note.trim() }),
    );
  }

  return (
    <>
      <p className={styles.caption}>{`${account.name} · ${differenceText(differenceMinor)}`}</p>
      <fieldset className={styles.causes}>
        <legend>{ACCOUNTS_COPY.cause}</legend>
        {CAUSES.map((value) => (
          <label key={value} className={styles.cause}>
            <input type="radio" name="cause" value={value} checked={cause === value} onChange={() => { setCause(value); setError(null); }} />
            {ACCOUNTS_COPY.causes[value]}
          </label>
        ))}
      </fieldset>
      {error !== null && <p className={styles.error}>{error}</p>}
      {!reviewLater && (
        <FormField label={ACCOUNTS_COPY.note}>
          {(control) => <textarea {...control} rows={2} maxLength={300} value={note} onChange={(event) => { setNote(event.target.value); }} />}
        </FormField>
      )}
      <p className={styles.caption}>{reviewLater ? ACCOUNTS_COPY.reviewHint : ACCOUNTS_COPY.adjustmentHint}</p>
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <div className={styles.sheetActions}>
        {action.unavailable ? (
          <Button variant="secondary" onClick={onClose}>{ACCOUNTS_COPY.close}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onBack}>{ACCOUNTS_COPY.backStep}</Button>
            <Button onClick={submit} disabled={action.busy}>{reviewLater ? ACCOUNTS_COPY.leaveForReview : ACCOUNTS_COPY.saveAdjustment}</Button>
          </>
        )}
      </div>
    </>
  );
}
