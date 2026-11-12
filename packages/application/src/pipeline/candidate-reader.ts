import {
  asTransactionId,
  type ExistingTransaction,
  type OwnerId,
  type TransactionId,
} from "@moneytrace/domain";
import type { EntryRecord, LedgerReader, TransactionRecord } from "../ports/ledger-reader";

export type CandidateQuery = {
  amountMinor: number;
  currency: string;
  fromMs: number;
  toMs: number;
};

const REAL_KINDS: ReadonlySet<string> = new Set(["bank", "cash", "familyCash", "creditLiability"]);

/**
 * What the ledger already holds that a new candidate might duplicate, on the owner's real accounts.
 * A debit on a real account is money in, for an asset or a liability alike. Reversed transactions and
 * their reversals have netted out, and opening balances are not activity.
 */
export class LedgerCandidateReader {
  private readonly reader: LedgerReader;

  constructor(reader: LedgerReader) {
    this.reader = reader;
  }

  async findRecent(ownerId: OwnerId, query: CandidateQuery): Promise<ExistingTransaction[]> {
    const entries = (
      await this.reader.listEntriesInRange(ownerId, query.fromMs, query.toMs)
    ).filter(
      (e) =>
        REAL_KINDS.has(e.accountKind) &&
        e.amountMinor === query.amountMinor &&
        e.currency === query.currency,
    );
    const live = new Map<string, TransactionRecord | null>();
    const rows: ExistingTransaction[] = [];
    for (const entry of entries) {
      let tx = live.get(entry.transactionId);
      if (tx === undefined) {
        tx = await this.liveTransaction(ownerId, entry.transactionId);
        live.set(entry.transactionId, tx);
      }
      if (tx !== null) rows.push(toExisting(entry, tx));
    }
    return rows;
  }

  private async liveTransaction(
    ownerId: OwnerId,
    id: TransactionId,
  ): Promise<TransactionRecord | null> {
    const tx = await this.reader.getTransaction(ownerId, id);
    if (tx === null || tx.state !== "posted" || tx.intentType === "openingBalance") return null;
    if (tx.correctionOf !== undefined) {
      const parent = await this.reader.getTransaction(ownerId, asTransactionId(tx.correctionOf));
      if (parent?.reversedBy === tx.id) return null;
    }
    return tx;
  }
}

function toExisting(entry: EntryRecord, tx: TransactionRecord): ExistingTransaction {
  return {
    transactionId: tx.id,
    state: "posted",
    accountId: entry.accountId,
    direction: entry.side === "debit" ? "in" : "out",
    amountMinor: entry.amountMinor,
    currency: entry.currency,
    occurredAtMs: entry.occurredAtMs,
    ...(tx.reference !== undefined ? { reference: tx.reference } : {}),
    isAuthorization: false,
    intentType: tx.intentType,
  };
}
