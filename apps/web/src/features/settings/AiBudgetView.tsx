import { SETTINGS_COPY } from "../../shared/copy";
import type { AiUsage } from "./settings-source";
import { formatUsdMicros } from "./settings-format";
import styles from "./settings.module.css";

export { formatUsdMicros };

const percent = (spent: number, limit: number) => (limit <= 0 ? 100 : Math.min(100, Math.round((spent * 100) / limit)));

/** Read-only AI spend against the app's limits. */
export function AiBudgetView({ ai }: { ai: AiUsage }) {
  const dayUsedUp = ai.spentTodayUsdMicros >= ai.dailyLimitUsdMicros;
  const monthUsedUp = ai.spentMonthUsdMicros >= ai.monthlyLimitUsdMicros;
  return (
    <>
      <section aria-labelledby="ai-today" className={styles.card}>
        <h3 id="ai-today">{SETTINGS_COPY.today}</h3>
        <span className={styles.big}>{formatUsdMicros(ai.spentTodayUsdMicros)}</span> <span className={styles.caption}>{SETTINGS_COPY.ofDay(formatUsdMicros(ai.dailyLimitUsdMicros))}</span>
        <div className={styles.meter} aria-hidden="true"><span style={{ width: `${String(percent(ai.spentTodayUsdMicros, ai.dailyLimitUsdMicros))}%` }} /></div>
      </section>
      <section aria-labelledby="ai-month" className={styles.card}>
        <h3 id="ai-month">{SETTINGS_COPY.thisMonth}</h3>
        <span className={styles.big}>{formatUsdMicros(ai.spentMonthUsdMicros)}</span> <span className={styles.caption}>{SETTINGS_COPY.ofMonth(formatUsdMicros(ai.monthlyLimitUsdMicros))}</span>
        <div className={styles.meter} aria-hidden="true"><span style={{ width: `${String(percent(ai.spentMonthUsdMicros, ai.monthlyLimitUsdMicros))}%` }} /></div>
      </section>
      <p className={styles.info}>
        {dayUsedUp && <b>{`${SETTINGS_COPY.todayUsedUp} `}</b>}
        {!dayUsedUp && monthUsedUp && <b>{`${SETTINGS_COPY.monthUsedUp} `}</b>}
        {SETTINGS_COPY.keepsWorking}
      </p>
      <p className={styles.caption}>{SETTINGS_COPY.limitsNote}</p>
    </>
  );
}
