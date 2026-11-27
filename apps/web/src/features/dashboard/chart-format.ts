import { percentFromBp } from "@moneytrace/contracts";

/** Basis points as a whole percent, rounded half up, in integers: 3659 → 37 (shared with tips). */
export const percentOf = percentFromBp;

/** "November 2026" → "Nov". */
export const shortMonth = (label: string): string => (label.split(" ")[0] ?? "").slice(0, 3);
