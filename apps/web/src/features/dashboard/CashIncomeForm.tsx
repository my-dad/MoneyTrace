"use client";

import { INCOME_LABELS, INCOME_SOURCES, formatBdt, type IncomeSource } from "@moneytrace/contracts";
import { useRef, useState } from "react";
import type { CommandRequest, CommandResponse } from "../../shared/commands";
import { DASHBOARD_COPY } from "../../shared/copy";
import { dhakaDate } from "../../shared/dhaka-date";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { useModalFocus } from "../../shared/use-modal-focus";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./dashboard.module.css";

export type CashIncomeCommands = {
  recordCashIncome: (request: CommandRequest<"recordCashIncome">) => Promise<CommandResponse<"recordCashIncome">>;
  editManualIncome: (request: CommandRequest<"editManualIncome">) => Promise<CommandResponse<"editManualIncome">>;
};

export type CashIncomeMode =
  | { kind: "add" }
  | { kind: "edit"; sourceEventId: string; amountMinor: number; from: IncomeSource };

/** Minor units as the plain taka a person would type: 2000000 → "20000", 150 → "1.50". */
const typed = (minor: number): string => {
  const taka = (minor - (minor % 100)) / 100;
  const poisha = minor % 100;
  return poisha === 0 ? String(taka) : `${String(taka)}.${String(poisha).padStart(2, "0")}`;
};

/** Add cash income (house rent paid in cash, say), or fix one added before. Reports only what the server confirmed. */
export function CashIncomeForm({
  mode,
  nowMs,
  commands,
  onClose,
}: {
  mode: CashIncomeMode;
  nowMs: number;
  commands: CashIncomeCommands;
  onClose: () => void;
}) {
  const focus = useModalFocus(onClose);
  const action = useAction();
  const editing = mode.kind === "edit";
  const today = dhakaDate(nowMs);
  const [amountText, setAmountText] = useState(editing ? typed(mode.amountMinor) : "");
  const [from, setFrom] = useState<IncomeSource | null>(editing ? mode.from : null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);
  const [done, setDone] = useState<string | null>(null);
  // One key per distinct entry: a retry of the same entry reuses it, so it is never recorded twice.
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  const amountMinor = parseBdtInput(amountText);
  const future = !editing && date > today;
  const ready = amountMinor !== null && from !== null && !future && date !== "";

  const submit = () => {
    if (amountMinor === null || from === null) return;
    const payload = JSON.stringify([amountMinor, from, note.trim(), date]);
    const key = attempt.current?.payload === payload ? attempt.current.key : crypto.randomUUID();
    attempt.current = { payload, key };
    void action.run(async () => {
      setDone(null);
      if (mode.kind === "edit") {
        await commands.editManualIncome({ idempotencyKey: key, sourceEventId: mode.sourceEventId, amountMinor, from });
        setDone(DASHBOARD_COPY.incomeUpdated(formatBdt(amountMinor), INCOME_LABELS[from]));
      } else {
        await commands.recordCashIncome({
          idempotencyKey: key,
          amountMinor,
          from,
          ...(note.trim() === "" ? {} : { note: note.trim() }),
          occurredOn: date,
        });
        setDone(DASHBOARD_COPY.incomeRecorded(formatBdt(amountMinor), INCOME_LABELS[from]));
      }
    });
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={focus.ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cash-income-title"
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={focus.onKeyDown}
        onClick={(event) => { event.stopPropagation(); }}
      >
        <h2 id="cash-income-title" className={styles.sheetTitle}>{editing ? DASHBOARD_COPY.editIncome : DASHBOARD_COPY.addIncome}</h2>
        <p className={styles.sheetHint}>{DASHBOARD_COPY.addIncomeHint}</p>
        <form
          className={styles.incomeForm}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className={styles.field}>
            <span>{DASHBOARD_COPY.amountLabel}</span>
            <input data-autofocus inputMode="decimal" autoComplete="off" value={amountText} onChange={(e) => { setAmountText(e.target.value); }} />
          </label>
          <fieldset className={styles.sourceChoices}>
            <legend>{DASHBOARD_COPY.fromLabel}</legend>
            {INCOME_SOURCES.map((id) => (
              <label key={id} className={styles.sourceChoice}>
                <input type="radio" name="income-from" value={id} checked={from === id} onChange={() => { setFrom(id); }} />
                <span>{INCOME_LABELS[id]}</span>
              </label>
            ))}
          </fieldset>
          {!editing && (
            <>
              <label className={styles.field}>
                <span>{DASHBOARD_COPY.noteLabel}</span>
                <input autoComplete="off" maxLength={200} value={note} onChange={(e) => { setNote(e.target.value); }} />
              </label>
              <label className={styles.field}>
                <span>{DASHBOARD_COPY.dateLabel}</span>
                <input type="date" max={today} value={date} onChange={(e) => { setDate(e.target.value); }} />
              </label>
              {future && <p className={styles.fieldError}>{DASHBOARD_COPY.futureDate}</p>}
            </>
          )}
          <div className={styles.sheetActions}>
            <button type="button" className={styles.sheetSecondary} onClick={onClose}>{DASHBOARD_COPY.close}</button>
            <button type="submit" className={styles.sheetPrimary} disabled={!ready || action.busy}>{DASHBOARD_COPY.save}</button>
          </div>
        </form>
        {action.busy && <p role="status" className={styles.sheetHint}>{DASHBOARD_COPY.recording}</p>}
        {done !== null && <p role="status" className={styles.sheetDone}>{done}</p>}
        <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      </div>
    </div>
  );
}
