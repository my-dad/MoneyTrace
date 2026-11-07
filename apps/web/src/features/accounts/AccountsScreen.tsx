"use client";

import { Button, Card, FormField, List, ListItem } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import type { AccountRow } from "../../shared/read-model-gateway";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import styles from "./accounts.module.css";

type AccountCommands = Pick<
  Commands,
  "createAccount" | "createPaymentInstrument" | "recordOpeningBalance"
>;
const providers = [
  "bkash",
  "brac",
  "mtb",
  "stanchart",
  "trustbank",
  "ucb",
  "upay",
  "other",
] as const;

export function AccountsScreen({
  accounts,
  commands,
}: {
  accounts: AccountRow[];
  commands: AccountCommands;
}) {
  const [adding, setAdding] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [instrumentStep, setInstrumentStep] = useState(false);
  const [kind, setKind] = useState<AccountRow["kind"]>("bank");
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [provider, setProvider] = useState("");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!adding) {
    const visible = accounts.filter((account) => account.id !== "cash-unassigned");
    return (
      <main className={styles.page}>
        <header>
          <a href="/">← Home</a>
          <h1>Accounts</h1>
        </header>
        <List>
          {visible.map((account) => (
            <ListItem key={account.id} title={account.name} subtitle={account.kind} />
          ))}
        </List>
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          Add account
        </Button>
      </main>
    );
  }

  if (accountId !== null && instrumentStep) {
    return (
      <main className={styles.page}>
        <header>
          <h1>Payment details</h1>
        </header>
        <Card>
          <p>These details help match future messages. Never enter a full card number.</p>
          <FormField
            label="Provider"
            hint={error ?? "A provider is required to match bank messages."}
          >
            {(control) => (
              <select
                {...control}
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                  setError(null);
                }}
              >
                <option value="">Choose provider</option>
                {providers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <Button
            onClick={() => {
              if (provider === "") {
                setError("A provider is required.");
                return;
              }
              void commands
                .createPaymentInstrument({
                  accountId,
                  provider: provider as (typeof providers)[number],
                  maskedIdentifier: digits,
                  type: kind === "creditLiability" ? "creditCard" : "bankAccount",
                })
                .then(() => {
                  setInstrumentStep(false);
                });
            }}
          >
            Save payment details
          </Button>
        </Card>
      </main>
    );
  }

  if (accountId !== null) {
    return (
      <OpeningBalanceForm
        kind={kind}
        balance={balance}
        setBalance={setBalance}
        date={date}
        setDate={setDate}
        error={error}
        setError={setError}
        saved={saved}
        onSave={async () => {
          const amountMinor = parseOpening(balance);
          if (amountMinor === null) {
            setError("Enter a valid amount.");
            return;
          }
          const response = await commands.recordOpeningBalance({
            accountId,
            amountMinor,
            currency: "BDT",
            effectiveAtMs: Date.parse(`${date}T00:00:00+06:00`),
          });
          setSaved(
            response.status === "alreadyRecorded"
              ? "This opening balance was already recorded."
              : "Opening balance saved.",
          );
        }}
      />
    );
  }

  async function submitAccount() {
    if (name.trim() === "") {
      setError("Account name is required.");
      return;
    }
    if (!/^(\d{3,4})?$/.test(digits)) {
      setError("Use only the last 3 or 4 digits. Never enter a full number.");
      return;
    }
    setError(null);
    const result = await commands.createAccount({ kind, name: name.trim(), currency: "BDT" });
    setAccountId(result.accountId);
    setInstrumentStep(digits !== "");
  }

  return (
    <main className={styles.page}>
      <header>
        <h1>Add account</h1>
      </header>
      <Card>
        <FormField label="Account name" {...(error === null ? {} : { error })}>
          {(control) => (
            <input
              {...control}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Kind">
          {(control) => (
            <select
              {...control}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as AccountRow["kind"]);
              }}
            >
              <option value="bank">Bank or mobile wallet</option>
              <option value="cash">Cash wallet</option>
              <option value="familyCash">Family-held cash</option>
              <option value="creditLiability">Credit card</option>
            </select>
          )}
        </FormField>
        <FormField label="Last 3 or 4 digits" hint="Leave blank for a mobile wallet.">
          {(control) => (
            <input
              {...control}
              value={digits}
              onChange={(event) => {
                setDigits(event.target.value);
              }}
            />
          )}
        </FormField>
        <Button
          onClick={() => {
            void submitAccount();
          }}
        >
          Save account
        </Button>
      </Card>
    </main>
  );
}

function parseOpening(text: string): number | null {
  const negative = text.trim().startsWith("-");
  const value = parseBdtInput(text.replace(/^\s*-\s*/, ""));
  return value === null ? null : negative ? -value : value;
}

function OpeningBalanceForm({
  kind,
  balance,
  setBalance,
  date,
  setDate,
  error,
  setError,
  saved,
  onSave,
}: {
  kind: AccountRow["kind"];
  balance: string;
  setBalance: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  error: string | null;
  setError: (value: string | null) => void;
  saved: string | null;
  onSave: () => Promise<void>;
}) {
  return (
    <main className={styles.page}>
      <header>
        <h1>Opening balance</h1>
      </header>
      <Card>
        <p>
          {kind === "creditLiability"
            ? "A negative amount means you owe money on this credit account."
            : "A negative amount means this account is overdrawn."}
        </p>
        <FormField label="Opening balance" {...(error === null ? {} : { error })}>
          {(control) => (
            <input
              {...control}
              inputMode="decimal"
              value={balance}
              onChange={(event) => {
                setBalance(event.target.value);
                setError(null);
              }}
            />
          )}
        </FormField>
        <FormField label="As of date">
          {(control) => (
            <input
              {...control}
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
          )}
        </FormField>
        <Button
          onClick={() => {
            void onSave();
          }}
        >
          Save opening balance
        </Button>
        {saved !== null && <p role="status">{saved}</p>}
      </Card>
    </main>
  );
}
