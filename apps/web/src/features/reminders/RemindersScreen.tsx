"use client";

import { Button, EmptyState } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Commands } from "../../shared/commands";
import { REMINDERS_COPY } from "../../shared/copy";
import { DemoUnavailableError } from "../../shared/demo-unavailable";
import type { FollowUpRow, ReadModelGateway } from "../../shared/read-model-gateway";
import { useAction } from "../../shared/use-action";
import { Sheet } from "../accounts/Sheet";
import { ActionStatus } from "../shell/ActionStatus";
import { clockLabel, dayLabel, snoozeOptions, splitReminders, whenLabel, type SnoozeChoice } from "./reminders-view-model";
import styles from "./reminders.module.css";

const CHOICE_LABELS: Record<SnoozeChoice, string> = {
  hour: REMINDERS_COPY.inOneHour,
  tonight: REMINDERS_COPY.tonight,
  tomorrow: REMINDERS_COPY.tomorrowMorning,
};

const answerHref = (id: string) => `/chat?followUp=${encodeURIComponent(id)}`;

type Open = { kind: "snooze" | "done"; row: FollowUpRow } | null;

export function RemindersScreen({
  gateway,
  commands,
  nowMs: givenNowMs,
}: {
  gateway: Pick<ReadModelGateway, "watchFollowUps">;
  commands: Pick<Commands, "snoozeFollowUp">;
  nowMs?: number;
}) {
  // Null until the first snapshot, so loading never reads as "nothing to answer".
  const [rows, setRows] = useState<FollowUpRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<Open>(null);
  const nowMs = useMemo(() => givenNowMs ?? Date.now(), [givenNowMs]);

  useEffect(() => {
    setFailed(false);
    return gateway.watchFollowUps(setRows, () => { setFailed(true); });
  }, [gateway, attempt]);

  const split = useMemo(() => (rows === null ? null : splitReminders(rows, nowMs)), [rows, nowMs]);

  let body;
  if (failed) {
    body = (
      <div role="alert" className={styles.alert}>
        <span>{REMINDERS_COPY.readFailed}</span>
        <Button variant="secondary" onClick={() => { setAttempt((n) => n + 1); }}>{REMINDERS_COPY.retry}</Button>
      </div>
    );
  } else if (split === null) {
    body = <p role="status" className={styles.caption}>{REMINDERS_COPY.loading}</p>;
  } else if (split.open.length === 0 && split.snoozed.length === 0) {
    body = <EmptyState title={REMINDERS_COPY.emptyTitle} description={REMINDERS_COPY.emptyBody} />;
  } else {
    body = (
      <>
        {split.open.length > 0 && (
          <section aria-labelledby="to-answer">
            <h2 id="to-answer" className={styles.sec}>{REMINDERS_COPY.toAnswer}<span>{split.open.length}</span></h2>
            <ul className={styles.list}>
              {split.open.map((row) => (
                <li key={row.id} className={styles.item}>
                  <p className={styles.q}>{row.question}</p>
                  <p className={styles.d}>{REMINDERS_COPY.details[row.trigger]}</p>
                  <p className={styles.m}>{REMINDERS_COPY.meta(dayLabel(row.createdAtMs), whenLabel(row.dueAtMs))}</p>
                  <div className={styles.acts}>
                    <Link href={answerHref(row.id)} className="mt-button mt-button--primary">{REMINDERS_COPY.answer}</Link>
                    <Button variant="secondary" onClick={() => { setSheet({ kind: "snooze", row }); }}>{REMINDERS_COPY.snooze}</Button>
                    <Button variant="secondary" onClick={() => { setSheet({ kind: "done", row }); }}>{REMINDERS_COPY.done}</Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {split.snoozed.length > 0 && (
          <section aria-labelledby="snoozed">
            <h2 id="snoozed" className={styles.sec}>{REMINDERS_COPY.snoozed}<span>{split.snoozed.length}</span></h2>
            <ul className={styles.list}>
              {split.snoozed.map((row) => (
                <li key={row.id} className={`${styles.item ?? ""} ${styles.sleeping ?? ""}`}>
                  <p className={styles.q}>{row.question}</p>
                  <p className={styles.m}>{REMINDERS_COPY.snoozedUntil(whenLabel(row.snoozedUntilMs ?? row.dueAtMs))}</p>
                  <div className={styles.acts}>
                    <Link href={answerHref(row.id)} className="mt-button mt-button--secondary">{REMINDERS_COPY.answerNow}</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <Link href="/" className={styles.back} aria-label={REMINDERS_COPY.back}>‹</Link>
        <h1 className={styles.title}>{REMINDERS_COPY.title}</h1>
      </div>
      {body}
      {sheet?.kind === "snooze" && (
        <SnoozeSheet row={sheet.row} nowMs={nowMs} snoozeFollowUp={commands.snoozeFollowUp} onClose={() => { setSheet(null); }} />
      )}
      {sheet?.kind === "done" && <DoneSheet row={sheet.row} onClose={() => { setSheet(null); }} />}
    </main>
  );
}

function SnoozeSheet({
  row,
  nowMs,
  snoozeFollowUp,
  onClose,
}: {
  row: FollowUpRow;
  nowMs: number;
  snoozeFollowUp: Commands["snoozeFollowUp"];
  onClose: () => void;
}) {
  const action = useAction();
  return (
    <Sheet title={REMINDERS_COPY.askAgain} onClose={onClose}>
      <p className={styles.caption}>{row.question}</p>
      <ul className={styles.options}>
        {snoozeOptions(nowMs).map((option) => (
          <li key={option.choice}>
            <button
              type="button"
              className={styles.opt}
              disabled={action.busy}
              onClick={() => { void action.run(() => snoozeFollowUp({ followUpId: row.id, untilMs: option.untilMs })).then((ok) => { if (ok) onClose(); }); }}
            >
              <span>{CHOICE_LABELS[option.choice]}</span>
              <span className={styles.caption}>{option.choice === "tomorrow" ? whenLabel(option.untilMs) : clockLabel(option.untilMs)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <Button variant="secondary" onClick={onClose}>{action.failed ? REMINDERS_COPY.close : REMINDERS_COPY.cancel}</Button>
    </Sheet>
  );
}

/** No backend command closes a question without an answer yet, so Done only reports that. */
function DoneSheet({ row, onClose }: { row: FollowUpRow; onClose: () => void }) {
  const action = useAction();
  return (
    <Sheet title={REMINDERS_COPY.confirmDone} onClose={onClose}>
      <p className={styles.caption}>{row.question}</p>
      <p className={styles.body}>{REMINDERS_COPY.confirmDoneBody}</p>
      <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
      <div className={styles.sheetActions}>
        {!action.failed && (
          <Button disabled={action.busy} onClick={() => { void action.run(() => Promise.reject(new DemoUnavailableError())); }}>
            {REMINDERS_COPY.markDone}
          </Button>
        )}
        <Button variant="secondary" onClick={onClose}>{action.failed ? REMINDERS_COPY.close : REMINDERS_COPY.cancel}</Button>
      </div>
    </Sheet>
  );
}
