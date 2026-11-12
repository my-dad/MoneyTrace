import { DASHBOARD_COPY } from "../../shared/copy";
import styles from "./dashboard.module.css";

export function MonthSwitch({ label, canGoNext, onPrevious, onNext }: { label: string; canGoNext: boolean; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className={styles.month}>
      <button type="button" className={styles.nav} aria-label={DASHBOARD_COPY.previous} onClick={onPrevious}>‹</button>
      <h2>{label}</h2>
      <button type="button" className={styles.nav} aria-label={DASHBOARD_COPY.next} disabled={!canGoNext} onClick={onNext}>›</button>
    </div>
  );
}
