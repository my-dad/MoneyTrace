import { useState } from "react";
import { COPY, SETTINGS_COPY } from "../../shared/copy";
import styles from "./settings.module.css";

/** Push needs browser permission and a backend; until then the switch only says so. The inbox is always on. */
export function NotificationSettings() {
  const [asked, setAsked] = useState(false);
  return (
    <>
      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span id="push-label"><b>{SETTINGS_COPY.push}</b><span className={styles.caption}>{SETTINGS_COPY.pushOff}</span></span>
          <button type="button" role="switch" aria-checked="false" aria-labelledby="push-label" className={styles.switch} onClick={() => { setAsked(true); }} />
        </div>
        {asked && <p role="status" className={styles.caption}>{COPY.notAvailableYet}</p>}
      </div>
      <p className={styles.info}>{SETTINGS_COPY.pushInfo}</p>
      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span id="inbox-label"><b>{SETTINGS_COPY.inbox}</b><span className={styles.caption}>{SETTINGS_COPY.inboxOn}</span></span>
          <button type="button" role="switch" aria-checked="true" aria-labelledby="inbox-label" className={styles.switch} disabled />
        </div>
      </div>
    </>
  );
}
