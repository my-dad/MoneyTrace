import { useState } from "react";
import { ACCOUNT_DELETION_CONFIRMATION } from "@moneytrace/contracts";
import { DASHBOARD_COPY } from "../../shared/copy";
import { useAction } from "../../shared/use-action";
import { ActionStatus } from "../shell/ActionStatus";
import styles from "./dashboard.module.css";

export function AccountMenu({
  aiSpend,
  onSignOut,
  onDeleteAccount,
}: {
  aiSpend: string | null;
  onSignOut: () => Promise<void>;
  /** Erases the account (CR-009). Resolves only once the server confirmed it. */
  onDeleteAccount: (confirmation: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const action = useAction();
  const removal = useAction();
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
          {!deleting ? (
            <button type="button" className={[styles.menuItem, styles.danger].join(" ")} onClick={() => { setDeleting(true); }}>{DASHBOARD_COPY.deleteAccount}</button>
          ) : (
            <form
              className={styles.deleteBox}
              onSubmit={(event) => {
                event.preventDefault();
                void removal.run(() => onDeleteAccount(typed));
              }}
            >
              <p>{DASHBOARD_COPY.deleteExplain}</p>
              <label htmlFor="delete-confirmation">{DASHBOARD_COPY.deleteLabel}</label>
              <input id="delete-confirmation" autoComplete="off" spellCheck={false} value={typed} onChange={(event) => { setTyped(event.target.value); }} />
              <div className={styles.deleteActions}>
                <button type="button" onClick={() => { setDeleting(false); setTyped(""); }}>{DASHBOARD_COPY.cancel}</button>
                <button type="submit" className={styles.danger} disabled={typed !== ACCOUNT_DELETION_CONFIRMATION || removal.busy}>{DASHBOARD_COPY.deleteConfirm}</button>
              </div>
              {removal.busy && <p role="status">{DASHBOARD_COPY.deleting}</p>}
              {removal.unavailable ? <p role="status">{DASHBOARD_COPY.deleteDemo}</p> : removal.failed && <p role="alert">{DASHBOARD_COPY.deleteFailed}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
