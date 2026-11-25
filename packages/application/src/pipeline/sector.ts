import { foldSector, sectorSchema } from "@moneytrace/contracts";
import { knownSector, normalizeMerchant, type CandidateTransaction, type OwnerId } from "@moneytrace/domain";
import type { PipelineDeps } from "./stages/deps";

const SPENDING: ReadonlySet<CandidateTransaction["kind"]> = new Set(["purchase", "cardPurchase", "cardTransaction", "unclassifiedDebit"]);

/** Whether the candidate is spending, the only kind that gets a sector. */
export const isSpending = (candidate: CandidateTransaction): boolean => SPENDING.has(candidate.kind);

export type ChosenSector = { sector: string; merchant?: { name: string; key: string } };

/**
 * Where spending goes, never guessed: the user's tag for the merchant, then the category the
 * parser or AI gave (if it is a sector), then the known-merchant list, else Not sorted yet.
 */
export async function chooseSector(
  deps: Pick<PipelineDeps, "merchantSectors">,
  ownerId: OwnerId,
  candidate: CandidateTransaction,
  retainedText: string,
): Promise<ChosenSector> {
  const merchant = candidate.counterparty === undefined ? null : normalizeMerchant(candidate.counterparty);
  const withMerchant = (sector: string): ChosenSector => (merchant === null ? { sector } : { sector, merchant });
  if (merchant !== null) {
    const tag = await deps.merchantSectors.get(ownerId, merchant.key);
    if (tag !== null) return withMerchant(tag.sector);
  }
  // Only a sector (or an older name for one) counts; anything else would file spending as Other.
  const given = candidate.category;
  if (given !== undefined && (sectorSchema.safeParse(given).success || foldSector(given) !== "other")) {
    return withMerchant(foldSector(given));
  }
  const known = merchant === null ? null : knownSector(merchant, retainedText);
  return withMerchant(known ?? "uncategorized");
}
