import { COPY } from "../../shared/copy";
import styles from "./shell.module.css";

export function DemoMarker() {
  return <p role="note" className={styles.demo}>{COPY.demoData}</p>;
}
