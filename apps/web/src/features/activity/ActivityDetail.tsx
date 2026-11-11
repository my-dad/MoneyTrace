import { Button } from "@moneytrace/ui-kit";
import Link from "next/link";
import { ACTIVITY_COPY } from "../../shared/copy";
import { dhakaDayLabel, dhakaTimeLabel } from "../../shared/dhaka-date";
import type { ActivityItem } from "./activity-view-model";
import { amountLabel } from "./ActivityScreen";
import styles from "./activity.module.css";

export function ActivityDetail({
  item,
  original,
  onBack,
  onOpen,
  onCorrect,
}: {
  item: ActivityItem;
  original: ActivityItem | null;
  onBack: () => void;
  onOpen: (id: string) => void;
  onCorrect: () => void;
}) {
  const status = item.tone === "verified" ? `${item.badge} · ${item.statusText}` : item.statusText;
  return (
    <article className={styles.detail}>
      <div className={styles.detailBar}>
        <button type="button" className={styles.back} onClick={onBack} aria-label={ACTIVITY_COPY.back}>‹</button>
        <span>{item.kindTitle ?? item.title}</span>
      </div>
      <div className={styles.hero}>
        <p className={styles.caption}>{item.title}</p>
        <p className={`${styles.big ?? ""} ${item.duplicate ? (styles.muted ?? "") : ""}`}>{amountLabel(item)}</p>
        <span className={`${styles.badge ?? ""} ${styles[item.tone] ?? ""}`}>{status}</span>
      </div>

      {item.tone === "needsAnswer" && <p className={styles.info}>{ACTIVITY_COPY.needsAnswerInfo}</p>}
      {item.duplicate && <p className={styles.info}>{ACTIVITY_COPY.duplicateInfo}</p>}

      <div className={styles.card}>
        <h2>{ACTIVITY_COPY.details}</h2>
        <dl>
          {item.accountName !== null && <div><dt>{ACTIVITY_COPY.account}</dt><dd>{item.accountName}</dd></div>}
          {item.destinationName !== null && <div><dt>{ACTIVITY_COPY.to}</dt><dd>{item.destinationName}</dd></div>}
          <div><dt>{ACTIVITY_COPY.date}</dt><dd>{`${dhakaDayLabel(item.occurredAtMs)}, ${dhakaTimeLabel(item.occurredAtMs)}`}</dd></div>
          {item.tone === "verified" && item.kind !== null && <div><dt>{ACTIVITY_COPY.effect}</dt><dd>{ACTIVITY_COPY.effectByKind[item.kind]}</dd></div>}
        </dl>
      </div>

      <div className={styles.card}>
        <h2>{item.sourceType === "chat" ? ACTIVITY_COPY.whatYouWrote : ACTIVITY_COPY.evidence}</h2>
        <p className={styles.evidence}>{item.retainedText}</p>
        {item.provenance !== null && <p className={styles.caption}>{item.provenance}</p>}
      </div>

      <div className={styles.actions}>
        {item.tone === "needsAnswer" && <Link href="/chat" className="mt-button mt-button--primary">{ACTIVITY_COPY.answerInChat}</Link>}
        {original !== null && <Button variant="secondary" onClick={() => { onOpen(original.id); }}>{ACTIVITY_COPY.viewOriginal}</Button>}
        {item.transactionId !== null && <Button variant="secondary" onClick={onCorrect}>{ACTIVITY_COPY.correct}</Button>}
      </div>
    </article>
  );
}
