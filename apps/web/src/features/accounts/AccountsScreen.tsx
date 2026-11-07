"use client";

import { Button, Card, FormField, List, ListItem } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { dhakaDate, dhakaDayStartMs, isDateText } from "../../shared/dhaka-date";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import type { AccountRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { SYSTEM_CASH_ACCOUNT_ID } from "../home/home-view-model";
import styles from "./accounts.module.css";

type AccountCommands = Pick<
  Commands,
  "createAccount" | "createPaymentInstrument" | "recordOpeningBalance"
>;
type FormKind = AccountRow["kind"] | "mobileWallet";

const BANK_PROVIDERS = ["brac", "mtb", "stanchart", "trustbank", "ucb", "other"] as const;
const WALLET_PROVIDERS = ["bkash", "upay", "other"] as const;
type Provider = (typeof BANK_PROVIDERS)[number] | (typeof WALLET_PROVIDERS)[number];

const KIND_LABEL: Record<AccountRow["kind"], string> = {
  bank: "Bank or mobile wallet",
  cash: "Cash wallet",
  familyCash: "Family-held cash",
  creditLiability: "Credit card",
};

const SAVE_FAILED = "That wasn't saved. Please try again.";

const hasDigits = (kind: FormKind) => kind === "bank" || kind === "creditLiability";
const accountKindOf = (kind: FormKind): AccountRow["kind"] => (kind === "mobileWallet" ? "bank" : kind);

function instrumentType(kind: FormKind) {
  if (kind === "mobileWallet") return "mobileWallet" as const;
  return kind === "creditLiability" ? ("creditCard" as const) : ("bankAccount" as const);
}

export function AccountsScreen({
  accounts,
  commands,
  readFailed = false,
}: {
  accounts: AccountRow[];
  commands: AccountCommands;
  readFailed?: boolean;
}) {
  const { busy, failed, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [instrumentStep, setInstrumentStep] = useState(false);
  const [kind, setKind] = useState<FormKind>("bank");
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [provider, setProvider] = useState("");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(() => dhakaDate(Date.now()));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function backToList() {
    setAdding(false);
    setAccountId(null);
    setInstrumentStep(false);
    setKind("bank");
    setName("");
    setDigits("");
    setProvider("");
    setBalance("");
    setDate(dhakaDate(Date.now()));
    setError(null);
    setSaved(null);
  }

  const failure = failed && (
    <p role="alert" className="mt-field__error">
      {SAVE_FAILED}
    </p>
  );

  if (!adding) {
    const visible = accounts.filter((account) => account.id !== SYSTEM_CASH_ACCOUNT_ID);
    return (
      <main className={styles.page}>
        <header>
          <a href="/">← Home</a>
          <h1>Accounts</h1>
        </header>
        {readFailed && (
          <p role="alert" className="mt-field__error">
            Couldn&apos;t load your accounts. This list may be out of date.
          </p>
        )}
        <List>
          {visible.map((account) => (
            <ListItem
              key={account.id}
              title={account.name}
              subtitle={KIND_LABEL[account.kind]}
              trailing={
                <Button
                  variant="text"
                  aria-label={`Set opening balance for ${account.name}`}
                  onClick={() => {
                    setKind(account.kind);
                    setAccountId(account.id);
                    setAdding(true);
                  }}
                >
                  Opening balance
                </Button>
              }
            />
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
    const providers = kind === "mobileWallet" ? WALLET_PROVIDERS : BANK_PROVIDERS;
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
            disabled={busy}
            onClick={() => {
              if (provider === "") {
                setError("A provider is required.");
                return;
              }
              void run(async () => {
                await commands.createPaymentInstrument({
                  accountId,
                  provider: provider as Provider,
                  maskedIdentifier: kind === "mobileWallet" ? "" : digits,
                  type: instrumentType(kind),
                });
                setInstrumentStep(false);
              });
            }}
          >
            Save payment details
          </Button>
          {failure}
        </Card>
      </main>
    );
  }

  if (accountId !== null) {
    return (
      <OpeningBalanceForm
        kind={accountKindOf(kind)}
        balance={balance}
        setBalance={setBalance}
        date={date}
        setDate={setDate}
        error={error}
        setError={setError}
        saved={saved}
        busy={busy}
        failure={failure}
        onBack={backToList}
        onSave={() => {
          const amountMinor = parseOpening(balance);
          if (amountMinor === null) {
            setError("Enter a valid amount.");
            return;
          }
          if (!isDateText(date) || date > dhakaDate(Date.now())) {
            setError("The date can't be in the future.");
            return;
          }
          setSaved(null);
          void run(async () => {
            const response = await commands.recordOpeningBalance({
              accountId,
              amountMinor,
              currency: "BDT",
              effectiveAtMs: dhakaDayStartMs(date),
            });
            setSaved(
              response.status === "alreadyRecorded"
                ? "This account's opening balance was already recorded, so it wasn't changed."
                : "Opening balance saved.",
            );
          });
        }}
      />
    );
  }

  function submitAccount() {
    if (name.trim() === "") {
      setError("Account name is required.");
      return;
    }
    if (hasDigits(kind) && !/^(\d{3,4})?$/.test(digits)) {
      setError("Use only the last 3 or 4 digits. Never enter a full number.");
      return;
    }
    setError(null);
    void run(async () => {
      const result = await commands.createAccount({
        kind: accountKindOf(kind),
        name: name.trim(),
        currency: "BDT",
      });
      setAccountId(result.accountId);
      setInstrumentStep(kind === "mobileWallet" || (hasDigits(kind) && digits !== ""));
    });
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
                setKind(event.target.value as FormKind);
                setDigits("");
              }}
            >
              <option value="bank">Bank account</option>
              <option value="mobileWallet">Mobile wallet</option>
              <option value="cash">Cash wallet</option>
              <option value="familyCash">Family-held cash</option>
              <option value="creditLiability">Credit card</option>
            </select>
          )}
        </FormField>
        {hasDigits(kind) && (
          <FormField label="Last 3 or 4 digits" hint="Optional. It helps match your bank's messages.">
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
        )}
        <Button disabled={busy} onClick={submitAccount}>
          Save account
        </Button>
        {failure}
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
  busy,
  failure,
  onBack,
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
  busy: boolean;
  failure: React.ReactNode;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <main className={styles.page}>
      <header>
        <h1>Opening balance</h1>
      </header>
      <Card>
        <p>
          {kind === "creditLiability"
            ? "Enter what you owe as a positive amount. A negative amount means the card is in credit."
            : "A negative amount means this account is overdrawn."}
        </p>
        <FormField label="Opening balance">
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
              max={dhakaDate(Date.now())}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setError(null);
              }}
            />
          )}
        </FormField>
        {error !== null && (
          <p role="alert" className="mt-field__error">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={onSave}>
          Save opening balance
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back to accounts
        </Button>
        {saved !== null && <p role="status">{saved}</p>}
        {failure}
      </Card>
    </main>
  );
}
