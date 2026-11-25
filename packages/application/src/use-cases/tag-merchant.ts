import { SECTOR_LABELS, foldSector, sectorSchema } from "@moneytrace/contracts";
import { DomainError, Money, asIdempotencyKey, type OwnerId } from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { LedgerReader } from "../ports/ledger-reader";
import type { LedgerWriter } from "../ports/ledger-writer";
import type { MerchantSectorRepository } from "../ports/merchant-sector-repository";
import { rebuildIntent } from "./correct-transaction";
import { ReverseAndReplace } from "./reverse-and-replace";

type Deps = {
  merchantSectors: MerchantSectorRepository;
  reader: LedgerReader;
  writer: LedgerWriter;
  accounts: AccountRepository;
  hasher: Hasher;
  clock: Clock;
};

/** Spends re-sorted per call; the rest wait for the next call, so one request stays short. */
const BATCH = 20;
/** How many of the merchant's transactions are read to find the ones to re-sort. */
const SCAN = 1000;
const SPENDING = new Set(["purchase", "cardPurchase"]);

/**
 * The user's sector for a merchant: remembered for later SMS, and every earlier spend from the
 * merchant in another sector is corrected into it (reversal plus replacement, audited).
 */
export class TagMerchant {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: { ownerId: OwnerId; merchantKey: string; merchantName: string; sector: string }): Promise<{ resorted: number; more: boolean }> {
    const { ownerId, merchantKey, merchantName } = input;
    const parsed = sectorSchema.safeParse(input.sector);
    if (!parsed.success || parsed.data === "uncategorized") throw new DomainError("invalidIntent", "that isn't a sector");
    const sector = parsed.data;
    const { reader, merchantSectors, clock } = this.deps;
    await merchantSectors.upsert(ownerId, { id: merchantKey, merchantName, sector, updatedAtMs: clock.nowMs() });

    const live = (await reader.listByMerchantKey(ownerId, merchantKey, SCAN)).filter(
      // A reversal carries the merchant too but undoes spending; only live spends are re-sorted.
      (t) =>
        t.state === "posted" &&
        !t.id.endsWith(":rev") &&
        SPENDING.has(t.intentType) &&
        foldSector(t.category ?? "uncategorized") !== sector,
    );
    const now = live.slice(0, BATCH);
    for (const tx of now) {
      const entries = await reader.getEntries(ownerId, tx.id);
      const spent = entries.find((e) => e.accountKind === "expense" && e.side === "debit");
      if (spent === undefined) continue;
      const result = await new ReverseAndReplace(this.deps).execute({
        ownerId,
        idempotencyKey: asIdempotencyKey(`tag-${tx.id}-${sector}`),
        originalTransactionId: tx.id,
        replacement: rebuildIntent(tx, entries, Money.ofMinor(spent.amountMinor, spent.currency), sector),
        actor: ownerId,
        rationale: `Sorted ${merchantName} as ${SECTOR_LABELS[sector]}`,
      });
      if (result.status === "idempotencyConflict") throw new DomainError("idempotencyConflict", "this spend was already corrected differently");
    }
    return { resorted: now.length, more: live.length > now.length };
  }
}
