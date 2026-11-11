"use client";

import { formatBdt } from "@moneytrace/contracts";
import { Button, Chip, EmptyState } from "@moneytrace/ui-kit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Commands } from "../../shared/commands";
import { ACTIVITY_COPY } from "../../shared/copy";
import { dhakaDate, dhakaDayLabel, dhakaTimeLabel } from "../../shared/dhaka-date";
import type { AccountRow, ReadModelGateway, SourceEventRow } from "../../shared/read-model-gateway";
import { ActivityDetail } from "./ActivityDetail";
import { filterActivity, findOriginal, toActivityItems, type ActivityFilter, type ActivityItem } from "./activity-view-model";
import { CorrectionSheet } from "./CorrectionSheet";
import styles from "./activity.module.css";

const FILTERS: ActivityFilter[] = ["all", "posted", "pending", "needsAnswer", "duplicates"];
const DAY_MS = 86_400_000;

export const amountLabel = (item: ActivityItem): string =>
  item.amountMinor === null ? "—" : `${item.direction === "in" ? "+" : ""}${formatBdt(item.amountMinor)}`;

function dayHeading(ms: number, nowMs: number): string {
  const day = dhakaDate(ms);
  const prefix = day === dhakaDate(nowMs) ? ACTIVITY_COPY.today : day === dhakaDate(nowMs - DAY_MS) ? ACTIVITY_COPY.yesterday : null;
  return prefix === null ? dhakaDayLabel(ms) : `${prefix} · ${dhakaDayLabel(ms)}`;
}

function groupByDay(items: ActivityItem[]): { day: string; items: ActivityItem[] }[] {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = dhakaDate(item.occurredAtMs);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

function subtitle(item: ActivityItem): string {
  const where = item.destinationName === null ? item.accountName : `${item.accountName ?? "?"} → ${item.destinationName}`;
  const source = item.sourceType === "sms" ? "SMS" : item.sourceType === "chat" ? "Chat" : item.sourceType;
  return [where, source, dhakaTimeLabel(item.occurredAtMs)].filter((part) => part !== null).join(" · ");
}

export function ActivityScreen({
  gateway,
  commands,
  selectedId,
  onSelect,
  nowMs = Date.now(),
}: {
  gateway: ReadModelGateway;
  commands: Pick<Commands, "correctTransaction">;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  nowMs?: number;
}) {
  const [events, setEvents] = useState<SourceEventRow[] | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    const onError = () => { setFailed(true); };
    const stops = [gateway.watchSourceEvents(200, setEvents, onError), gateway.watchAccounts(setAccounts, onError)];
    return () => { stops.forEach((stop) => { stop(); }); };
  }, [gateway, attempt]);

  const items = useMemo(() => (events === null ? [] : toActivityItems(events, accounts)), [events, accounts]);
  const visible = filterActivity(items, filter);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const needsAnswer = filterActivity(items, "needsAnswer").length;

  let body;
  if (failed) {
    body = (
      <div role="alert" className={styles.alert}>
        <span>{ACTIVITY_COPY.readFailed}</span>
        <Button variant="secondary" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>{ACTIVITY_COPY.retry}</Button>
      </div>
    );
  } else if (events === null) {
    body = <p role="status" className={styles.caption}>{ACTIVITY_COPY.loading}</p>;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title={ACTIVITY_COPY.emptyTitle}
        description={ACTIVITY_COPY.emptyBody}
        action={<Link href="/chat" className="mt-button mt-button--primary">{ACTIVITY_COPY.openChat}</Link>}
      />
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        title={ACTIVITY_COPY.filterEmpty[filter].title}
        description={ACTIVITY_COPY.filterEmpty[filter].body}
        action={<Button variant="secondary" onClick={() => { setFilter("all"); }}>{ACTIVITY_COPY.showAll}</Button>}
      />
    );
  } else {
    body = groupByDay(visible).map((group) => (
      <section key={group.day} aria-labelledby={`day-${group.day}`}>
        <h2 id={`day-${group.day}`} className={styles.day}>{dayHeading(group.items[0]?.occurredAtMs ?? 0, nowMs)}</h2>
        <ul className={styles.list}>
          {group.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`${styles.row ?? ""} ${item.duplicate ? (styles.duplicate ?? "") : ""} ${item.id === selectedId ? (styles.selected ?? "") : ""}`}
                onClick={() => { onSelect(item.id); }}
                {...(item.id === selectedId ? { "aria-current": "true" as const } : {})}
              >
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{item.title}</span>
                  <span className={styles.rowSub}>{subtitle(item)}</span>
                </span>
                <span className={styles.rowAmount}>
                  <span className={`${styles.amount ?? ""} ${item.direction === "move" ? (styles.move ?? "") : ""}`}>{amountLabel(item)}</span>
                  <span className={`${styles.badge ?? ""} ${styles[item.tone] ?? ""}`}>{item.badge}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <main className={`${styles.page ?? ""} ${selected === null ? "" : (styles.hasDetail ?? "")}`}>
      <section aria-label="Activity list" className={styles.listPane}>
        <h1 className={styles.title}>{ACTIVITY_COPY.title}</h1>
        {events !== null && items.length > 0 && <p className={styles.caption}>{items.length} items</p>}
        {events !== null && items.length > 0 && !failed && (
          <div className={styles.chips} role="group" aria-label="Filter">
            {FILTERS.map((name) => (
              <Chip key={name} selected={filter === name} onClick={() => { setFilter(name); }}>
                {ACTIVITY_COPY.filters[name]}
                {name === "needsAnswer" && needsAnswer > 0 && <span className={styles.chipCount}>{needsAnswer}</span>}
              </Chip>
            ))}
          </div>
        )}
        {body}
      </section>
      {selected !== null && (
        <section aria-label="Transaction detail" className={styles.detailPane}>
          <ActivityDetail
            item={selected}
            original={findOriginal(items, selected)}
            onBack={() => { onSelect(null); }}
            onOpen={onSelect}
            onCorrect={() => { setCorrecting(true); }}
          />
        </section>
      )}
      {selected !== null && correcting && (
        <CorrectionSheet item={selected} correctTransaction={commands.correctTransaction} onClose={() => { setCorrecting(false); }} />
      )}
    </main>
  );
}
