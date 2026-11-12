import { useId, type ReactNode } from "react";
import { useModalFocus } from "../../shared/use-modal-focus";
import styles from "./accounts-home.module.css";

/** A modal sheet: bottom sheet on phones, centred on desktop. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const focus = useModalFocus(onClose);
  return (
    <div className={styles.scrim}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.sheet} {...focus}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className={styles.steps}>
      <span className="mt-sr-only">{`Step ${String(current)} of 3`}</span>
      {[1, 2, 3].map((step) => (
        <i key={step} aria-hidden="true" className={step <= current ? styles.on : undefined} />
      ))}
    </div>
  );
}
