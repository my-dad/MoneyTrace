import { Button, FormField } from "@moneytrace/ui-kit";
import { useId, useState } from "react";
import type { CommandResponse, Commands } from "../../shared/commands";
import { ACTIVITY_COPY } from "../../shared/copy";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { useModalFocus } from "../../shared/use-modal-focus";
import { ActionStatus } from "../shell/ActionStatus";
import type { ActivityItem } from "./activity-view-model";
import styles from "./activity.module.css";

type Mode = "correct" | "reverse";

/** Correction is reversal plus optional replacement, done by the server; the original always stays. */
export function CorrectionSheet({
  item,
  correctTransaction,
  onClose,
}: {
  item: ActivityItem;
  correctTransaction: Commands["correctTransaction"];
  onClose: () => void;
}) {
  const titleId = useId();
  const [mode, setMode] = useState<Mode>("correct");
  const [amount, setAmount] = useState(item.amountMinor === null ? "" : String(item.amountMinor / 100));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  // The mode is kept with the result, so the confirmation always names what was actually saved.
  const [result, setResult] = useState<{ mode: Mode; response: CommandResponse<"correctTransaction"> } | null>(null);
  const [idempotencyKey] = useState(() => `correct-${item.id}-${String(Date.now())}`);
  const action = useAction();
  const transactionId = item.transactionId;
  const focus = useModalFocus(onClose);

  function submit() {
    const amountMinor = mode === "correct" ? parseBdtInput(amount) : null;
    const next = {
      ...(mode === "correct" && amountMinor === null ? { amount: ACTIVITY_COPY.amountInvalid } : {}),
      ...(reason.trim() === "" ? { reason: ACTIVITY_COPY.reasonMissing } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0 || transactionId === null) return;
    const submitted = mode;
    void action.run(async () => {
      const response = await correctTransaction({
        idempotencyKey,
        transactionId,
        ...(amountMinor === null ? {} : { replacement: { amountMinor, currency: "BDT" as const } }),
        rationale: reason.trim(),
      });
      setResult({ mode: submitted, response });
    });
  }

  return (
    <div className={styles.scrim}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.sheet} {...focus}>
        <h2 id={titleId}>{ACTIVITY_COPY.sheetTitle}</h2>
        <p className={styles.caption}>{ACTIVITY_COPY.sheetBody}</p>
        <fieldset className={styles.modes}>
          <legend className="mt-sr-only">Change type</legend>
          {(["correct", "reverse"] as const).map((value) => (
            <label key={value} className={styles.mode}>
              <input type="radio" name="mode" value={value} disabled={result !== null} checked={mode === value} onChange={() => { setMode(value); }} />
              {value === "correct" ? ACTIVITY_COPY.modeCorrect : ACTIVITY_COPY.modeReverse}
            </label>
          ))}
        </fieldset>
        {mode === "correct" && (
          <FormField label={ACTIVITY_COPY.newAmount} {...(errors.amount === undefined ? {} : { error: errors.amount })}>
            {(control) => <input {...control} inputMode="decimal" disabled={result !== null} value={amount} onChange={(event) => { setAmount(event.target.value); }} />}
          </FormField>
        )}
        <FormField label={ACTIVITY_COPY.reason} {...(errors.reason === undefined ? {} : { error: errors.reason })}>
          {(control) => <textarea {...control} rows={3} maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); }} />}
        </FormField>
        {result !== null && !action.failed && (
          <p role="status" className={styles.result}>
            {result.response.status === "alreadyRecorded"
              ? ACTIVITY_COPY.changeAlreadyRecorded
              : `${result.mode === "correct" ? ACTIVITY_COPY.correctionRecorded : ACTIVITY_COPY.reversalRecorded}. ${ACTIVITY_COPY.listNotUpdated}`}
          </p>
        )}
        <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
        <div className={styles.sheetActions}>
          <Button variant="secondary" onClick={onClose}>{result === null ? ACTIVITY_COPY.cancel : ACTIVITY_COPY.close}</Button>
          {result === null && (
            <Button onClick={submit} disabled={action.busy}>
              {mode === "correct" ? ACTIVITY_COPY.saveCorrection : ACTIVITY_COPY.saveReversal}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
