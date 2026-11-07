/** Typed taka to minor units, working on the digits so no float is ever involved. Null if unsure. */
export function parseBdtInput(text: string): number | null {
  const cleaned = text.replace(/[৳,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (match === null) return null;
  const minor = Number(`${match[1] ?? ""}${(match[2] ?? "").padEnd(2, "0")}`);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
