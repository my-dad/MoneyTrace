function partsInZone(ms: number, timezone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  return Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
}

const req = (p: Record<string, number>, key: string): number => {
  const v = p[key];
  if (v === undefined) throw new Error(`missing ${key}`);
  return v;
};

/** The instant of a wall-clock time in a zone. Correct wherever the offset is stable that day. */
function zonedToMs(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seen = partsInZone(guess, timezone);
  const seenUtc = Date.UTC(
    req(seen, "year"),
    req(seen, "month") - 1,
    req(seen, "day"),
    req(seen, "hour"),
    req(seen, "minute"),
  );
  return guess - (seenUtc - guess);
}

/** The next time the clock in `timezone` reads `HH:MM`, strictly after `nowMs`. */
export function nextLocalTimeMs(nowMs: number, timezone: string, hhmm: string): number {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  const p = partsInZone(nowMs, timezone);
  const today = zonedToMs(timezone, req(p, "year"), req(p, "month"), req(p, "day"), hour, minute);
  if (today > nowMs) return today;
  return zonedToMs(timezone, req(p, "year"), req(p, "month"), req(p, "day") + 1, hour, minute);
}

/** The calendar month containing `nowMs` in `timezone`, as a half-open range. */
export function monthRangeInZone(
  nowMs: number,
  timezone: string,
): { fromMs: number; toMs: number } {
  const p = partsInZone(nowMs, timezone);
  const year = req(p, "year");
  const month = req(p, "month");
  return {
    fromMs: zonedToMs(timezone, year, month, 1, 0, 0),
    toMs: zonedToMs(timezone, year, month + 1, 1, 0, 0),
  };
}
