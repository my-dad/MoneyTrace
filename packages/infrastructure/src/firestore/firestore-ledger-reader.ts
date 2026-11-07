import type {
  Clock,
  EntryRecord,
  LedgerReader,
  StoredCutoverMarker,
  TransactionRecord,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  LedgerDate,
  asAccountId,
  asTransactionId,
  type AccountId,
  type OwnerId,
  type TransactionId,
} from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { ownerPath } from "./paths";
import { bySequence, toEntryRecord, toTransactionRecord } from "./records";

export class FirestoreLedgerReader implements LedgerReader {
  private readonly db: Firestore;

  // The clock is accepted so all three adapters share one constructor shape; reads need no time.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(db: Firestore, _clock: Clock) {
    this.db = db;
  }

  async getTransaction(ownerId: OwnerId, id: TransactionId): Promise<TransactionRecord | null> {
    const s = await this.db.doc(ownerPath(ownerId, "transactions", id)).get();
    return s.exists ? toTransactionRecord(s.data()) : null;
  }

  async getEntries(ownerId: OwnerId, txId: TransactionId): Promise<EntryRecord[]> {
    const snap = await this.db
      .collection(ownerPath(ownerId, "ledgerEntries"))
      .where("transactionId", "==", txId)
      .get();
    return snap.docs.map((d) => toEntryRecord(d.data())).sort(bySequence);
  }

  async getBalance(ownerId: OwnerId, accountId: AccountId): Promise<number> {
    const s = await this.db.doc(ownerPath(ownerId, "balances", accountId)).get();
    return s.exists ? OWNER_COLLECTIONS.balances.parse(s.data()).debitMinusCreditMinor : 0;
  }

  async recomputeBalance(ownerId: OwnerId, accountId: AccountId): Promise<number> {
    const snap = await this.db
      .collection(ownerPath(ownerId, "ledgerEntries"))
      .where("accountId", "==", accountId)
      .get();
    let sum = 0;
    for (const d of snap.docs) {
      const e = toEntryRecord(d.data());
      sum += e.side === "debit" ? e.amountMinor : -e.amountMinor;
    }
    return sum;
  }

  async getCutoverMarkers(
    ownerId: OwnerId,
    accountIds: readonly AccountId[],
  ): Promise<StoredCutoverMarker[]> {
    const unique = [...new Set(accountIds)];
    if (unique.length === 0) return [];
    const snaps = await this.db.getAll(
      ...unique.map((id) => this.db.doc(ownerPath(ownerId, "cutoverMarkers", id))),
    );
    const found: StoredCutoverMarker[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = OWNER_COLLECTIONS.cutoverMarkers.parse(s.data());
      found.push({
        accountId: asAccountId(d.accountId),
        effectiveAt: LedgerDate.fromEpochMs(d.effectiveAtMs),
        transactionId: asTransactionId(d.transactionId),
      });
    }
    return found;
  }
}
