import { formatBdt } from "@moneytrace/contracts";
import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import { ACCOUNTS_COPY } from "../../shared/copy";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./accounts-home.module.css";
import type { AccountView } from "./accounts-view-model";
import type { CashSource } from "./cash-source";
import { Sheet } from "./Sheet";

/** Giving cash to a family member changes who holds it. It is never spending. */
export function AllocationForm({ from, to, source, onClose }: { from: AccountView[]; to: AccountView[]; source: CashSource; onClose: () => void }) {
  const [fromId, setFromId] = useState(from[0]?.id ?? "");
  const [toId, setToId] = useState(to[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  const giver = from.find((row) => row.id === fromId);
  const holder = to.find((row) => row.id === toId);

  function submit() {
    const amountMinor = parseBdtInput(amount);
    if (amountMinor === null || amountMinor <= 0) {
      setError(ACCOUNTS_COPY.amountInvalid("3,000"));
      return;
    }
    if (giver !== undefined && amountMinor > giver.amountMinor) {
      setError(ACCOUNTS_COPY.moreThanHeld(giver.name, formatBdt(giver.amountMinor)));
      return;
    }
    setError(undefined);
    void action.run(() => source.allocateCash({ fromAccountId: fromId, toAccountId: toId, amountMinor }));
  }

  return (
    <Sheet title={ACCOUNTS_COPY.giveCash}>
      <FormField label={ACCOUNTS_COPY.from}>
        {(control) => (
          <select {...control} value={fromId} onChange={(event) => { setFromId(event.target.value); }}>
            {from.map((row) => <option key={row.id} value={row.id}>{`${row.name} · ${formatBdt(row.amountMinor)}`}</option>)}
          </select>
        )}
      </FormField>
      <FormField label={ACCOUNTS_COPY.to}>
        {(control) => (
          <select {...control} value={toId} onChange={(event) => { setToId(event.target.value); }}>
            {to.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        )}
      </FormField>
      <FormField label={ACCOUNTS_COPY.amount} {...(error === undefined ? {} : { error })}>
        {(control) => <input {...control} inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); }} />}
      </FormField>
      <p className={styles.info}>{ACCOUNTS_COPY.custodyInfo(holder?.name ?? "they")}</p>
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <div className={styles.sheetActions}>
        <Button variant="secondary" onClick={onClose}>{action.unavailable ? ACCOUNTS_COPY.close : ACCOUNTS_COPY.cancel}</Button>
        {!action.unavailable && <Button onClick={submit} disabled={action.busy}>{ACCOUNTS_COPY.giveAction}</Button>}
      </div>
    </Sheet>
  );
}
