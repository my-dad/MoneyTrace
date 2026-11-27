import type { CSSProperties } from "react";
import { COPY, TIPS_COPY } from "../../shared/copy";
import type { TipItem, TipsViewModel } from "./tips-view";
import styles from "./dashboard.module.css";

/**
 * Two or three gentle tips, each tied to a figure our code worked out. Status text is honest:
 * it never says new tips were made unless they were stored.
 */
export function TipsCard({
  view,
  busy,
  failed,
  limitReached,
  demo = false,
  onNewTips,
  onSort,
  onCountCash,
}: {
  view: TipsViewModel;
  busy: boolean;
  failed: boolean;
  limitReached: boolean;
  /** New tips was pressed in the demo: nothing was saved. */
  demo?: boolean;
  onNewTips?: () => void;
  /** Opens sorting for the biggest unsorted shop; absent when there is none to sort. */
  onSort?: () => void;
  onCountCash?: () => void;
}) {
  if (view.kind === "none" && !busy) return null;
  let status: string | null = null;
  if (busy) status = TIPS_COPY.making;
  else if (demo) status = COPY.demoUnavailable;
  else if (failed) status = TIPS_COPY.failed;
  else if (limitReached) status = TIPS_COPY.limitReached;
  else if (view.kind === "tips") status = view.age;

  const action = (item: TipItem) => {
    if (item.kind === "unsorted" && onSort !== undefined)
      return <button type="button" className={styles.tipAction} onClick={onSort}>{TIPS_COPY.sort}</button>;
    if (item.kind === "unexplainedCash" && onCountCash !== undefined)
      return <button type="button" className={styles.tipAction} onClick={onCountCash}>{TIPS_COPY.countCash}</button>;
    return null;
  };

  return (
    <section aria-labelledby="tips-heading" className={`${styles.card ?? ""} ${styles.tipsCard ?? ""}`}>
      <h3 id="tips-heading">{TIPS_COPY.heading}</h3>
      {view.kind === "notEnoughData" && <p className={styles.tipNote}>{TIPS_COPY.notEnoughData}</p>}
      {view.kind === "tips" && view.items.length === 0 && <p className={styles.tipNote}>{TIPS_COPY.nothingStandsOut}</p>}
      {view.kind === "tips" && view.items.length > 0 && (
        <ul className={styles.tipList}>
          {view.items.map((item) => (
            <li key={item.id} style={{ "--tip-dot": item.sector === undefined ? "var(--mt-cat-none)" : `var(--mt-sector-${item.sector})` } as CSSProperties}>
              <span className={styles.tipDot} aria-hidden="true" />
              <div className={styles.tipBody}>
                <b className={styles.tipHeadline}>{item.headline}</b>
                <span className={styles.tipDetail}>{item.detail}</span>
                {item.advice !== undefined && <span className={styles.tipAdvice}>{item.advice}</span>}
                {action(item)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Only when no advice is shown at all: earlier advice still holds (it has no numbers). */}
      {view.kind === "tips" && view.factsOnly && !busy && view.items.length > 0 && view.items.every((i) => i.advice === undefined) && (
        <p className={styles.tipNote}>{TIPS_COPY.unavailable}</p>
      )}
      <div className={styles.tipFooter}>
        <p role="status" className={styles.tipStatus}>{status ?? ""}</p>
        {view.kind === "tips" && view.items.length > 0 && onNewTips !== undefined && (
          <button type="button" className={styles.newTips} disabled={busy} onClick={onNewTips}>{TIPS_COPY.newTips}</button>
        )}
      </div>
    </section>
  );
}
