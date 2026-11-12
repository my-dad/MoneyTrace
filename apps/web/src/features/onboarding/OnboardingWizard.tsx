"use client";

import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { ONBOARDING_COPY, SETTINGS_COPY } from "../../shared/copy";
import { dhakaDate, dhakaDayStartMs } from "../../shared/dhaka-date";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import type { AccountRow } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { PeriodFields, type PeriodDraft } from "../settings/PeriodFields";
import { parseStartDay } from "../settings/settings-format";
import settingsStyles from "../settings/settings.module.css";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./onboarding.module.css";

type Step = 1 | 2 | 3 | 4 | 5;
type WizardCommands = Pick<Commands, "createAccount" | "updateSettings" | "recordOpeningBalance">;
type Frequency = "daily" | "weekly" | "off";

const KIND_LABEL: Record<AccountRow["kind"], string> = { bank: "Bank or wallet", cash: "Cash", familyCash: "Held by family", creditLiability: "Credit card" };
const balanceLabel = (account: Pick<AccountRow, "name" | "kind">) =>
  account.kind === "creditLiability" ? `${account.name} · ${ONBOARDING_COPY.youOwe}` : account.name;

/** First-time setup. Steps are local state, so Back and Next keep what was entered. */
export function OnboardingWizard({
  commands,
  accounts,
  onDone,
}: {
  commands: WizardCommands;
  accounts: Pick<AccountRow, "id" | "name" | "kind">[];
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [period, setPeriod] = useState<PeriodDraft>({ kind: "salaryCycle", startDay: "25" });
  const [added, setAdded] = useState<Pick<AccountRow, "id" | "name" | "kind">[]>([]);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<AccountRow["kind"]>("bank");
  const [asOf, setAsOf] = useState(() => dhakaDate(Date.now()));
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [digest, setDigest] = useState("21:00");
  const [error, setError] = useState<string | undefined>(undefined);
  const addAction = useAction();
  const finishAction = useAction();
  const [unchanged, setUnchanged] = useState<string[]>([]);
  // The read model also delivers accounts created here, so keep only the ones it hasn't shown yet.
  const all = [...accounts, ...added.filter((row) => !accounts.some((account) => account.id === row.id))];

  function next() {
    if (step === 2 && period.kind === "salaryCycle" && parseStartDay(period.startDay) === null) {
      setError(SETTINGS_COPY.startDayInvalid);
      return;
    }
    if (step === 4 && Object.values(balances).some((text) => text.trim() !== "" && parseBdtInput(text) === null)) {
      setError(ONBOARDING_COPY.balancesInvalid);
      return;
    }
    setError(undefined);
    setStep((current) => (current < 5 ? ((current + 1) as Step) : current));
  }

  function back() {
    setError(undefined);
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  }

  function addAccount() {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    void addAction.run(async () => {
      const { accountId } = await commands.createAccount({ kind: newKind, name: trimmed, currency: "BDT" });
      setAdded((rows) => [...rows, { id: accountId, name: trimmed, kind: newKind }]);
      setNewName("");
    });
  }

  function finish() {
    const startDay = parseStartDay(period.startDay);
    setUnchanged([]);
    void finishAction.run(async () => {
      await commands.updateSettings({
        reportingCycle: period.kind === "salaryCycle" && startDay !== null ? { kind: "salaryCycle", startDay } : { kind: "calendarMonth" },
        reminders: { frequency, digestLocalTime: digest, minThresholdMinor: 0 },
      });
      const kept: string[] = [];
      for (const [accountId, text] of Object.entries(balances)) {
        const amountMinor = parseBdtInput(text);
        if (amountMinor === null) continue;
        const response = await commands.recordOpeningBalance({ accountId, amountMinor, currency: "BDT", effectiveAtMs: dhakaDayStartMs(asOf) });
        if (response.status === "alreadyRecorded") kept.push(all.find((account) => account.id === accountId)?.name ?? accountId);
      }
      // Never move on as if a typed balance was saved when the server kept the old one.
      if (kept.length > 0) setUnchanged(kept);
      else onDone?.();
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.progress} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= step ? styles.on : undefined} />)}
      </div>
      <p className={styles.stepText}>{ONBOARDING_COPY.step(step)}</p>

      {step === 1 && (
        <>
          <h1 className={styles.title}>{ONBOARDING_COPY.welcome}</h1>
          <p className={styles.lead}>{ONBOARDING_COPY.welcomeBody}</p>
          <FormField label={ONBOARDING_COPY.name}>
            {(control) => <input {...control} autoComplete="nickname" value={name} onChange={(event) => { setName(event.target.value); }} />}
          </FormField>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className={styles.title}>{ONBOARDING_COPY.currencyTitle}</h1>
          <div>
            <p className="mt-field__label">{ONBOARDING_COPY.currency}</p>
            <p className={styles.fixed}>{ONBOARDING_COPY.currencyValue}<span>{ONBOARDING_COPY.currencyHint}</span></p>
          </div>
          <PeriodFields value={period} onChange={setPeriod} error={error} />
        </>
      )}

      {step === 3 && (
        <>
          <h1 className={styles.title}>{ONBOARDING_COPY.accountsTitle}</h1>
          <p className={styles.lead}>{ONBOARDING_COPY.accountsBody}</p>
          {all.length === 0 ? (
            <p className={styles.lead}>{ONBOARDING_COPY.noAccounts}</p>
          ) : (
            <ul className={styles.list}>
              {all.map((account) => <li key={account.id}>{account.name}<small>{KIND_LABEL[account.kind]}</small></li>)}
            </ul>
          )}
          <div className={styles.addRow}>
            <FormField label="Account name">
              {(control) => <input {...control} value={newName} onChange={(event) => { setNewName(event.target.value); }} />}
            </FormField>
            <FormField label="Kind">
              {(control) => (
                <select {...control} value={newKind} onChange={(event) => { setNewKind(event.target.value as AccountRow["kind"]); }}>
                  {(Object.keys(KIND_LABEL) as AccountRow["kind"][]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                </select>
              )}
            </FormField>
            <ActionStatus busy={addAction.busy} failed={addAction.failed} unavailable={addAction.unavailable} />
            <Button variant="secondary" onClick={addAccount} disabled={addAction.busy}>{ONBOARDING_COPY.addAccount}</Button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h1 className={styles.title}>{ONBOARDING_COPY.balancesTitle}</h1>
          <p className={styles.info}>{ONBOARDING_COPY.balancesInfo}</p>
          <FormField label={ONBOARDING_COPY.asOf}>
            {(control) => <input {...control} type="date" max={dhakaDate(Date.now())} value={asOf} onChange={(event) => { setAsOf(event.target.value); }} />}
          </FormField>
          {all.length === 0 ? (
            <p className={styles.lead}>{ONBOARDING_COPY.noBalances}</p>
          ) : (
            <div className={styles.balances}>
              {all.map((account) => (
                <FormField key={account.id} label={balanceLabel(account)}>
                  {(control) => (
                    <input {...control} inputMode="decimal" placeholder="৳ 0" value={balances[account.id] ?? ""} onChange={(event) => { setBalances((rows) => ({ ...rows, [account.id]: event.target.value })); }} />
                  )}
                </FormField>
              ))}
            </div>
          )}
          {error !== undefined && <p className={styles.error}>{error}</p>}
        </>
      )}

      {step === 5 && (
        <>
          <h1 className={styles.title}>{ONBOARDING_COPY.remindersTitle}</h1>
          <p className={styles.lead}>{ONBOARDING_COPY.remindersBody}</p>
          <fieldset className={settingsStyles.choices}>
            <legend>{SETTINGS_COPY.frequency}</legend>
            {(["daily", "weekly", "off"] as const).map((value) => (
              <label key={value} className={settingsStyles.choice}>
                <input type="radio" name="onboarding-frequency" checked={frequency === value} onChange={() => { setFrequency(value); }} />
                {SETTINGS_COPY.frequencies[value]}
              </label>
            ))}
          </fieldset>
          <FormField label={SETTINGS_COPY.digestTime}>
            {(control) => <input {...control} type="time" value={digest} onChange={(event) => { setDigest(event.target.value); }} />}
          </FormField>
          <ActionStatus busy={finishAction.busy} failed={finishAction.failed} unavailable={finishAction.unavailable} />
          {unchanged.length > 0 && <p role="status">{ONBOARDING_COPY.alreadyRecorded(unchanged.join(", "))}</p>}
        </>
      )}

      <div className={styles.actions}>
        {step > 1 && <Button variant="secondary" onClick={back}>{ONBOARDING_COPY.back}</Button>}
        {step < 5 ? (
          <Button onClick={next}>{ONBOARDING_COPY.next}</Button>
        ) : (
          <Button onClick={finish} disabled={finishAction.busy}>{ONBOARDING_COPY.finish}</Button>
        )}
      </div>
    </main>
  );
}
