import { Button, FormField } from "@moneytrace/ui-kit";
import { useState } from "react";
import type { Commands } from "../../shared/commands";
import { SETTINGS_COPY } from "../../shared/copy";
import { parseBdtInput } from "../../shared/parse-bdt-input";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import type { ReminderSettings } from "./settings-source";
import styles from "./settings.module.css";

const FREQUENCIES = ["daily", "weekly", "off"] as const;

export function ReminderSettingsForm({ initial, updateSettings }: { initial: ReminderSettings; updateSettings: Commands["updateSettings"] }) {
  const [frequency, setFrequency] = useState(initial.frequency);
  const [digest, setDigest] = useState(initial.digestLocalTime);
  const [quietFrom, setQuietFrom] = useState(initial.quietHours?.startLocalTime ?? "");
  const [quietTo, setQuietTo] = useState(initial.quietHours?.endLocalTime ?? "");
  const [minimum, setMinimum] = useState(String(initial.minThresholdMinor / 100));
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();

  function save() {
    const minThresholdMinor = parseBdtInput(minimum);
    if (minThresholdMinor === null) {
      setError(SETTINGS_COPY.amountInvalid);
      return;
    }
    setError(undefined);
    const quietHours = quietFrom !== "" && quietTo !== "" ? { quietHours: { startLocalTime: quietFrom, endLocalTime: quietTo } } : {};
    void action.run(() => updateSettings({ reminders: { frequency, digestLocalTime: digest, minThresholdMinor, ...quietHours } }));
  }

  return (
    <div className={styles.form}>
      <fieldset className={styles.choices}>
        <legend>{SETTINGS_COPY.frequency}</legend>
        {FREQUENCIES.map((value) => (
          <label key={value} className={styles.choice}>
            <input type="radio" name="frequency" checked={frequency === value} onChange={() => { setFrequency(value); }} />
            {SETTINGS_COPY.frequencies[value]}
          </label>
        ))}
      </fieldset>
      <FormField label={SETTINGS_COPY.digestTime}>
        {(control) => <input {...control} type="time" value={digest} onChange={(event) => { setDigest(event.target.value); }} />}
      </FormField>
      <div className={styles.two}>
        <FormField label={SETTINGS_COPY.quietFrom}>
          {(control) => <input {...control} type="time" value={quietFrom} onChange={(event) => { setQuietFrom(event.target.value); }} />}
        </FormField>
        <FormField label={SETTINGS_COPY.quietTo}>
          {(control) => <input {...control} type="time" value={quietTo} onChange={(event) => { setQuietTo(event.target.value); }} />}
        </FormField>
      </div>
      <FormField label={SETTINGS_COPY.minAmount} hint={SETTINGS_COPY.minAmountHint} {...(error === undefined ? {} : { error })}>
        {(control) => <input {...control} inputMode="decimal" value={minimum} onChange={(event) => { setMinimum(event.target.value); }} />}
      </FormField>
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <Button onClick={save} disabled={action.busy}>{SETTINGS_COPY.saveReminders}</Button>
    </div>
  );
}
