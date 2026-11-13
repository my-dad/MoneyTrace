/**
 * Typed taka to minor units, working on the digits so no float is ever involved. Null if unsure.
 * Amounts must be positive unless `allowZero` (a cash count of an empty wallet).
 */
export function parseBdtInput(text: string, options: { allowZero?: boolean } = {}): number | null {
  const cleaned = text.replace(/[৳,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (match === null) return null;
  const minor = Number(`${match[1] ?? ""}${(match[2] ?? "").padEnd(2, "0")}`);
  const smallest = options.allowZero === true ? 0 : 1;
  return Number.isSafeInteger(minor) && minor >= smallest ? minor : null;
}
