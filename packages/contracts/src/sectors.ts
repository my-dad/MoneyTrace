import { z } from "zod";

/** Where spending goes (approved 2026-11-25). Stored as the expense account's category. */
export const SECTOR_IDS = [
  "food",
  "transport",
  "groceries",
  "shopping",
  "bills",
  "health",
  "education",
  "family",
  "rent",
  "other",
  "uncategorized",
] as const;
export type SectorId = (typeof SECTOR_IDS)[number];
export const sectorSchema = z.enum(SECTOR_IDS);

export const SECTOR_LABELS: Record<SectorId, string> = {
  food: "Food",
  transport: "Transport",
  groceries: "Groceries",
  shopping: "Shopping",
  bills: "Bills & recharge",
  health: "Health",
  education: "Education",
  family: "Family",
  rent: "Rent",
  other: "Other",
  uncategorized: "Not sorted yet",
};

/** Categories written before the sector list, read as today's sectors. No ledger rewrite. */
const LEGACY: Record<string, SectorId> = { "eating-out": "food", "mobile-recharge": "bills" };

const isSector = (value: string): value is SectorId => (SECTOR_IDS as readonly string[]).includes(value);

/** A stored category as a sector: today's ids as they are, older ones folded, anything else Other. */
export function foldSector(category: string): SectorId {
  if (isSector(category)) return category;
  return LEGACY[category] ?? "other";
}

/** What manually added cash income is from. Stored as the income account's category. */
export const INCOME_SOURCES = ["rent", "salary", "business", "gift", "other"] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];
export const incomeSourceSchema = z.enum(INCOME_SOURCES);

export const INCOME_LABELS: Record<IncomeSource, string> = {
  rent: "House rent",
  salary: "Salary",
  business: "Business",
  gift: "Gift",
  other: "Other",
};
