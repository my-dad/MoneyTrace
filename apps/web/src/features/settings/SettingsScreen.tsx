"use client";

import { Button } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Commands } from "../../shared/commands";
import { COPY, SETTINGS_COPY } from "../../shared/copy";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import { AiBudgetView } from "./AiBudgetView";
import { NotificationSettings } from "./NotificationSettings";
import { PeriodFields, type PeriodDraft } from "./PeriodFields";
import { PrivacyView } from "./PrivacyView";
import { ReminderSettingsForm } from "./ReminderSettingsForm";
import { formatUsdMicros, parseStartDay, timeLabel } from "./settings-format";
import type { ReportingCycle, SettingsSource, SettingsView } from "./settings-source";
import styles from "./settings.module.css";

export type SettingsSection = keyof typeof SETTINGS_COPY.sections;
const SECTIONS = Object.keys(SETTINGS_COPY.sections) as SettingsSection[];

export const isSettingsSection = (value: string | null): value is SettingsSection =>
  value !== null && (SECTIONS as string[]).includes(value);

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; view: SettingsView };

function summary(section: SettingsSection, view: SettingsView): string {
  switch (section) {
    case "period":
      return view.reportingCycle.kind === "salaryCycle" ? SETTINGS_COPY.cycleSummary(view.reportingCycle.startDay) : SETTINGS_COPY.monthSummary;
    case "ai":
      return SETTINGS_COPY.aiSummary(formatUsdMicros(view.ai.spentMonthUsdMicros), formatUsdMicros(view.ai.monthlyLimitUsdMicros));
    case "reminders":
      return SETTINGS_COPY.remindersSummary[view.notifications.frequency](timeLabel(view.notifications.digestLocalTime));
    case "notifications":
      return SETTINGS_COPY.notificationsSummary;
    case "privacy":
      return SETTINGS_COPY.privacySummary;
  }
}

export function SettingsScreen({
  source,
  commands,
  section,
  onSection,
  onSignOut,
}: {
  source: SettingsSource | null;
  commands: Pick<Commands, "updateSettings">;
  section: SettingsSection | null;
  onSection: (section: SettingsSection | null) => void;
  onSignOut: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (source === null) return;
    let live = true;
    setLoad({ status: "loading" });
    source
      .load()
      .then((view) => { if (live) setLoad({ status: "ready", view }); })
      .catch(() => { if (live) setLoad({ status: "failed" }); });
    return () => { live = false; };
  }, [source, attempt]);

  const view = load.status === "ready" ? load.view : null;
  const open = view === null ? null : section;

  let body;
  if (source === null) {
    body = <div className={styles.card}><p>{COPY.notAvailableYet}</p></div>;
  } else if (load.status === "loading") {
    body = <p role="status" className={styles.caption}>{SETTINGS_COPY.loading}</p>;
  } else if (load.status === "failed") {
    body = (
      <div role="alert" className={styles.alert}>
        <span>{SETTINGS_COPY.readFailed}</span>
        <Button variant="secondary" onClick={() => { setAttempt((n) => n + 1); }}>{SETTINGS_COPY.retry}</Button>
      </div>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {SECTIONS.map((name) => (
          <li key={name}>
            <button
              type="button"
              className={`${styles.row ?? ""} ${name === open ? (styles.selected ?? "") : ""}`}
              onClick={() => { onSection(name); }}
              {...(name === open ? { "aria-current": "true" as const } : {})}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{SETTINGS_COPY.sections[name]}</span>
                <span className={styles.rowSub}>{summary(name, load.view)}</span>
              </span>
              <span className={styles.chev} aria-hidden="true">›</span>
            </button>
          </li>
        ))}
        <li>
          <Link href="/accounts" className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{SETTINGS_COPY.accounts}</span>
              <span className={styles.rowSub}>{SETTINGS_COPY.accountsSummary}</span>
            </span>
            <span className={styles.chev} aria-hidden="true">›</span>
          </Link>
        </li>
      </ul>
    );
  }

  return (
    <main className={`${styles.page ?? ""} ${open === null ? "" : (styles.hasDetail ?? "")}`}>
      <section aria-label="Settings list" className={styles.listPane}>
        <h1 className={styles.title}>{SETTINGS_COPY.title}</h1>
        {body}
        <div className={styles.signOut}>
          <Button variant="secondary" onClick={onSignOut}>{SETTINGS_COPY.signOut}</Button>
        </div>
      </section>
      {open !== null && view !== null && (
        <section aria-labelledby="settings-detail" className={styles.detailPane}>
          <div className={styles.detailBar}>
            <button type="button" className={styles.back} onClick={() => { onSection(null); }} aria-label={SETTINGS_COPY.back}>‹</button>
            <h2 id="settings-detail">{SETTINGS_COPY.sections[open]}</h2>
          </div>
          {open === "period" && <PeriodForm initial={view.reportingCycle} updateSettings={commands.updateSettings} />}
          {open === "ai" && <AiBudgetView ai={view.ai} />}
          {open === "reminders" && <ReminderSettingsForm initial={view.notifications} updateSettings={commands.updateSettings} />}
          {open === "notifications" && <NotificationSettings />}
          {open === "privacy" && <PrivacyView />}
        </section>
      )}
    </main>
  );
}

function PeriodForm({ initial, updateSettings }: { initial: ReportingCycle; updateSettings: Commands["updateSettings"] }) {
  const [draft, setDraft] = useState<PeriodDraft>({ kind: initial.kind, startDay: initial.kind === "salaryCycle" ? String(initial.startDay) : "25" });
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();

  function save() {
    const startDay = parseStartDay(draft.startDay);
    if (draft.kind === "salaryCycle" && startDay === null) {
      setError(SETTINGS_COPY.startDayInvalid);
      return;
    }
    setError(undefined);
    const reportingCycle: ReportingCycle = draft.kind === "salaryCycle" && startDay !== null ? { kind: "salaryCycle", startDay } : { kind: "calendarMonth" };
    void action.run(() => updateSettings({ reportingCycle }));
  }

  return (
    <div className={styles.form}>
      <PeriodFields value={draft} onChange={setDraft} error={error} />
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <Button onClick={save} disabled={action.busy}>{SETTINGS_COPY.savePeriod}</Button>
    </div>
  );
}
