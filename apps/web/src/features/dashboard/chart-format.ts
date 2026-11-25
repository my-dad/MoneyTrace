/** Basis points as a whole percent, rounded half up, in integers: 3659 → 37. */
export const percentOf = (bp: number): number => (bp + 50 - ((bp + 50) % 100)) / 100;

/** "November 2026" → "Nov". */
export const shortMonth = (label: string): string => (label.split(" ")[0] ?? "").slice(0, 3);
