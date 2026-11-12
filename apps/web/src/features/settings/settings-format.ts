/** Micro-dollars to "$1.43": whole cents, rounded down, integer math only. */
export function formatUsdMicros(micros: number): string {
  const cents = Math.floor(micros / 10_000);
  return `$${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, "0")}`;
}

/** "21:00" → "9:00 pm". */
export function timeLabel(localTime: string): string {
  const [hours = 0, minutes = 0] = localTime.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  return `${String(hours % 12 === 0 ? 12 : hours % 12)}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** A salary-cycle start day: a whole number from 1 to 28, or null. */
export function parseStartDay(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const day = Number(text.trim());
  return day >= 1 && day <= 28 ? day : null;
}
