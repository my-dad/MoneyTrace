import { formatBdt } from "@moneytrace/contracts";
import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import { ACCOUNTS_COPY } from "../../shared/copy";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import { AdjustmentForm, differenceText } from "./AdjustmentForm";
import styles from "./accounts-home.module.css";
import { cashDifference, type AccountView } from "./accounts-view-model";
import type { CashSource } from "./cash-source";
import { Sheet, Steps } from "./Sheet";

/** Count cash in three steps: count it, see the difference, explain it. */
export function CashCountFlow({ accounts, source, onClose }: { accounts: AccountView[]; source: CashSource; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [counted, setCounted] = useState("");
  const [countedMinor, setCountedMinor] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  const account = accounts.find((row) => row.id === accountId);
  const difference = account === undefined ? 0 : cashDifference(account.amountMinor, countedMinor);

  function next() {
    const value = parseBdtInput(counted);
    if (value === null) {
      setError(ACCOUNTS_COPY.amountInvalid("7,700"));
      return;
    }
    setError(undefined);
    setCountedMinor(value);
    setStep(2);
  }

  if (step === 3 && account !== undefined) {
    return (
      <Sheet title={ACCOUNTS_COPY.explainTitle} onClose={onClose}>
        <Steps current={3} />
        <AdjustmentForm account={account} differenceMinor={difference} countedMinor={countedMinor} source={source} onBack={() => { setStep(2); }} onClose={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet title={ACCOUNTS_COPY.countCash} onClose={onClose}>
      <Steps current={step} />
      {step === 1 ? (
        <>
          <FormField label={ACCOUNTS_COPY.whichCash}>
            {(control) => (
              <select {...control} value={accountId} onChange={(event) => { setAccountId(event.target.value); }}>
                {accounts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            )}
          </FormField>
          <FormField label={ACCOUNTS_COPY.howMuch} {...(error === undefined ? {} : { error })}>
            {(control) => <input {...control} inputMode="decimal" value={counted} onChange={(event) => { setCounted(event.target.value); }} />}
          </FormField>
          <div className={styles.sheetActions}>
            <Button variant="secondary" onClick={onClose}>{ACCOUNTS_COPY.cancel}</Button>
            <Button onClick={next}>{ACCOUNTS_COPY.next}</Button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.diff}>
            <span className={styles.caption}>{ACCOUNTS_COPY.expected(formatBdt(account?.amountMinor ?? 0))}</span>
            <b>{difference === 0 ? ACCOUNTS_COPY.matches : differenceText(difference)}</b>
            {difference === 0 ? ACCOUNTS_COPY.matchNote : ACCOUNTS_COPY.diffNote}
          </div>
          <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
          <div className={styles.sheetActions}>
            {action.unavailable ? (
              <Button variant="secondary" onClick={onClose}>{ACCOUNTS_COPY.close}</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => { setStep(1); }}>{ACCOUNTS_COPY.backStep}</Button>
                {difference === 0 ? (
                  <Button disabled={action.busy} onClick={() => { void action.run(() => source.recordCashCount({ accountId, countedMinor })); }}>{ACCOUNTS_COPY.saveCount}</Button>
                ) : (
                  <Button onClick={() => { setStep(3); }}>{ACCOUNTS_COPY.next}</Button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
