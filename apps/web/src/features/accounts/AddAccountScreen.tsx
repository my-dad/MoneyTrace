"use client";

import { Button, Card, FormField } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { ADD_ACCOUNT_COPY } from "../../shared/copy";
import type { AccountRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./accounts.module.css";

type Kind = AccountRow["kind"];
const KINDS = Object.keys(ADD_ACCOUNT_COPY.types) as Kind[];

/** CR-006: an account is just a name and a type, and starts at ৳0. No digits, bank or opening balance. */
export function AddAccountScreen({ commands }: { commands: Pick<Commands, "createAccount"> }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("bank");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const action = useAction();

  function save() {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError(ADD_ACCOUNT_COPY.nameMissing);
      return;
    }
    setError(null);
    setSaved(null);
    void action.run(async () => {
      await commands.createAccount({ kind, name: trimmed, currency: "BDT" });
      setSaved(trimmed);
    });
  }

  function another() {
    setName("");
    setKind("bank");
    setSaved(null);
  }

  return (
    <main className={styles.page}>
      <header>
        <Link href="/accounts">{ADD_ACCOUNT_COPY.back}</Link>
        <h1>{ADD_ACCOUNT_COPY.title}</h1>
      </header>
      <Card>
        <p>{ADD_ACCOUNT_COPY.startsAtZero}</p>
        <FormField label={ADD_ACCOUNT_COPY.name} {...(error === null ? {} : { error })}>
          {(control) => <input {...control} maxLength={200} value={name} onChange={(event) => { setName(event.target.value); }} />}
        </FormField>
        <FormField label={ADD_ACCOUNT_COPY.type}>
          {(control) => (
            <select {...control} value={kind} onChange={(event) => { setKind(event.target.value as Kind); }}>
              {KINDS.map((value) => <option key={value} value={value}>{ADD_ACCOUNT_COPY.types[value]}</option>)}
            </select>
          )}
        </FormField>
        {action.failed && !action.unavailable && <p role="alert" className="mt-field__error">{ADD_ACCOUNT_COPY.failed}</p>}
        {action.unavailable && <ActionStatus busy={false} failed unavailable />}
        {saved !== null && <p role="status">{ADD_ACCOUNT_COPY.saved(saved)}</p>}
        {saved === null ? (
          <Button disabled={action.busy} onClick={save}>{ADD_ACCOUNT_COPY.save}</Button>
        ) : (
          <Button variant="secondary" onClick={another}>{ADD_ACCOUNT_COPY.addAnother}</Button>
        )}
      </Card>
    </main>
  );
}
