import { useState } from "react";
import { DASHBOARD_COPY } from "../../shared/copy";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./dashboard.module.css";

export function AccountMenu({ aiSpend, onSignOut }: { aiSpend: string | null; onSignOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  return (
    <div className={styles.menuWrap}>
      <button type="button" className={styles.menuButton} aria-label={DASHBOARD_COPY.menu} aria-expanded={open} aria-controls="account-menu" onClick={() => { setOpen((value) => !value); }}>☰</button>
      {open && (
        <div id="account-menu" className={styles.menu}>
          <p className={styles.menuItem}>
            {DASHBOARD_COPY.aiBudget}
            <small>{aiSpend ?? DASHBOARD_COPY.loading}</small>
          </p>
          <button type="button" className={styles.menuItem} disabled={action.busy} onClick={() => { void action.run(onSignOut); }}>{DASHBOARD_COPY.signOut}</button>
          <ActionStatus busy={action.busy} failed={action.failed} unavailable={action.unavailable} />
        </div>
      )}
    </div>
  );
}
