import { SETTINGS_COPY } from "../../shared/copy";
import styles from "./settings.module.css";

export function PrivacyView() {
  return (
    <>
      <section aria-labelledby="privacy-keeps" className={styles.card}>
        <h3 id="privacy-keeps">{SETTINGS_COPY.keeps}</h3>
        <ul>{SETTINGS_COPY.keepsItems.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section aria-labelledby="privacy-never" className={styles.card}>
        <h3 id="privacy-never">{SETTINGS_COPY.never}</h3>
        <ul>{SETTINGS_COPY.neverItems.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section aria-labelledby="privacy-who" className={styles.card}>
        <h3 id="privacy-who">{SETTINGS_COPY.who}</h3>
        <p>{SETTINGS_COPY.whoBody}</p>
      </section>
    </>
  );
}
