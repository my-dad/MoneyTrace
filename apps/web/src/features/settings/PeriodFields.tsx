import { FormField } from "@moneytrace/ui-kit";
import { SETTINGS_COPY } from "../../shared/copy";
import styles from "./settings.module.css";

export type PeriodDraft = { kind: "calendarMonth" | "salaryCycle"; startDay: string };

/** The reporting period choice, shared by Settings and setup step 2. */
export function PeriodFields({ value, onChange, error }: { value: PeriodDraft; onChange: (next: PeriodDraft) => void; error?: string | undefined }) {
  return (
    <>
      <fieldset className={styles.choices}>
        <legend>{SETTINGS_COPY.reportsBy}</legend>
        {(["calendarMonth", "salaryCycle"] as const).map((kind) => (
          <label key={kind} className={styles.choice}>
            <input type="radio" name="period-kind" checked={value.kind === kind} onChange={() => { onChange({ ...value, kind }); }} />
            {SETTINGS_COPY.kinds[kind]}
          </label>
        ))}
      </fieldset>
      {value.kind === "salaryCycle" && (
        <FormField label={SETTINGS_COPY.startDay} hint={SETTINGS_COPY.startDayHint} {...(error === undefined ? {} : { error })}>
          {(control) => <input {...control} inputMode="numeric" value={value.startDay} onChange={(event) => { onChange({ ...value, startDay: event.target.value }); }} />}
        </FormField>
      )}
    </>
  );
}
