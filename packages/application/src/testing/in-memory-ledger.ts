import {
  DomainError,
  assertBalanced,
  assertTransition,
  type AccountId,
  type EntryDraft,
  type OwnerId,
  type TransactionId,
} from "@moneytrace/domain";
import type { AccountRecord, AccountRepository } from "../ports/account-repository";
import type { EntryRecord, LedgerReader, TransactionRecord } from "../ports/ledger-reader";
import type {
  CorrectionCommit,
  LedgerCommit,
  LedgerCommitResult,
  LedgerWriter,
} from "../ports/ledger-writer";

type IdempotencyEntry = { payloadHash: string; transactionId: TransactionId };

type OwnerLedger = {
  transactions: Map<string, TransactionRecord>;
  entries: Map<string, EntryRecord[]>;
  balances: Map<string, number>;
  idempotency: Map<string, IdempotencyEntry>;
  markers: Map<string, number>;
};

const cloneTx = (t: TransactionRecord): TransactionRecord => ({
  ...t,
  sourceEventIds: [...t.sourceEventIds],
  ...(t.auditDetails ? { auditDetails: { ...t.auditDetails } } : {}),
});

/** Runs a synchronous body and surfaces its outcome as a promise, so each call is atomic. */
function atomically<T>(body: () => T): Promise<T> {
  try {
    return Promise.resolve(body());
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

/** In-memory LedgerWriter and LedgerReader. Every call validates first, then mutates. */
export class InMemoryLedger implements LedgerWriter, LedgerReader {
  private readonly owners = new Map<string, OwnerLedger>();

  private of(ownerId: OwnerId): OwnerLedger {
    let s = this.owners.get(ownerId);
    if (s === undefined) {
      s = {
        transactions: new Map(),
        entries: new Map(),
        balances: new Map(),
        idempotency: new Map(),
        markers: new Map(),
      };
      this.owners.set(ownerId, s);
    }
    return s;
  }

  private static replay(
    s: OwnerLedger,
    key: string,
    payloadHash: string,
  ): LedgerCommitResult | null {
    const seen = s.idempotency.get(key);
    if (seen === undefined) return null;
    return seen.payloadHash === payloadHash
      ? { status: "duplicate", transactionId: seen.transactionId }
      : { status: "idempotencyConflict" };
  }

  private static write(s: OwnerLedger, tx: TransactionRecord, drafts: readonly EntryDraft[]): void {
    s.transactions.set(tx.id, cloneTx(tx));
    s.entries.set(
      tx.id,
      drafts.map((d, i) => ({
        id: `${tx.id}:${String(i + 1)}`,
        transactionId: tx.id,
        accountId: d.account.id,
        accountKind: d.account.kind,
        side: d.side,
        amountMinor: d.amount.minor,
        currency: d.amount.currency,
        occurredAtMs: tx.occurredAtMs,
      })),
    );
    for (const d of drafts) {
      const signed = d.side === "debit" ? d.amount.minor : -d.amount.minor;
      s.balances.set(d.account.id, (s.balances.get(d.account.id) ?? 0) + signed);
    }
  }

  commit(ownerId: OwnerId, c: LedgerCommit): Promise<LedgerCommitResult> {
    return atomically(() => {
      const s = this.of(ownerId);
      const replay = InMemoryLedger.replay(s, c.idempotencyKey, c.payloadHash);
      if (replay) return replay;

      if (c.transaction.state !== "posted") {
        throw new DomainError("invalidIntent", "a commit must carry a posted transaction");
      }
      assertTransition(s.transactions.get(c.transaction.id)?.state ?? null, "posted");
      if (c.entries.length > 0 || c.cutoverMarker === undefined) assertBalanced(c.entries);
      if (c.cutoverMarker && s.markers.has(c.cutoverMarker.accountId)) {
        return { status: "idempotencyConflict" };
      }

      InMemoryLedger.write(s, c.transaction, c.entries);
      if (c.cutoverMarker)
        s.markers.set(c.cutoverMarker.accountId, c.cutoverMarker.effectiveAt.epochMs);
      s.idempotency.set(c.idempotencyKey, {
        payloadHash: c.payloadHash,
        transactionId: c.transaction.id,
      });
      return { status: "committed", transactionId: c.transaction.id };
    });
  }

  commitCorrection(ownerId: OwnerId, c: CorrectionCommit): Promise<LedgerCommitResult> {
    return atomically(() => {
      const s = this.of(ownerId);
      const replay = InMemoryLedger.replay(s, c.idempotencyKey, c.payloadHash);
      if (replay) return replay;

      const original = s.transactions.get(c.originalTransactionId);
      assertTransition(original?.state ?? null, "reversed");
      if (original === undefined) throw new DomainError("invalidTransition", "original not found");
      assertTransition(s.transactions.get(c.reversal.id)?.state ?? null, "posted");
      assertBalanced(c.reversalEntries);
      if (c.replacement) {
        assertTransition(s.transactions.get(c.replacement.transaction.id)?.state ?? null, "posted");
        assertBalanced(c.replacement.entries);
      }

      s.transactions.set(original.id, {
        ...original,
        state: "reversed",
        reversedBy: c.reversal.id,
      });
      InMemoryLedger.write(s, c.reversal, c.reversalEntries);
      if (c.replacement) InMemoryLedger.write(s, c.replacement.transaction, c.replacement.entries);
      s.idempotency.set(c.idempotencyKey, {
        payloadHash: c.payloadHash,
        transactionId: c.reversal.id,
      });
      return { status: "committed", transactionId: c.reversal.id };
    });
  }

  savePending(ownerId: OwnerId, t: TransactionRecord): Promise<void> {
    return atomically(() => {
      const s = this.of(ownerId);
      assertTransition(s.transactions.get(t.id)?.state ?? null, "pending");
      if (t.state !== "pending")
        throw new DomainError("invalidTransition", "state must be pending");
      s.transactions.set(t.id, cloneTx(t));
    });
  }

  getTransaction(ownerId: OwnerId, id: TransactionId): Promise<TransactionRecord | null> {
    return atomically(() => {
      const t = this.of(ownerId).transactions.get(id);
      return t ? cloneTx(t) : null;
    });
  }

  getEntries(ownerId: OwnerId, txId: TransactionId): Promise<EntryRecord[]> {
    return atomically(() => (this.of(ownerId).entries.get(txId) ?? []).map((e) => ({ ...e })));
  }

  getBalance(ownerId: OwnerId, accountId: AccountId): Promise<number> {
    return atomically(() => this.of(ownerId).balances.get(accountId) ?? 0);
  }

  recomputeBalance(ownerId: OwnerId, accountId: AccountId): Promise<number> {
    return atomically(() => {
      let sum = 0;
      for (const list of this.of(ownerId).entries.values()) {
        for (const e of list) {
          if (e.accountId === accountId) sum += e.side === "debit" ? e.amountMinor : -e.amountMinor;
        }
      }
      return sum;
    });
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly owners = new Map<string, Map<string, AccountRecord>>();

  create(ownerId: OwnerId, record: AccountRecord): Promise<void> {
    return atomically(() => {
      let accounts = this.owners.get(ownerId);
      if (accounts === undefined) {
        accounts = new Map();
        this.owners.set(ownerId, accounts);
      }
      if (accounts.has(record.id)) throw new Error("account already exists");
      accounts.set(record.id, { ...record });
    });
  }

  getMany(ownerId: OwnerId, ids: readonly AccountId[]): Promise<AccountRecord[]> {
    return atomically(() => {
      const accounts = this.owners.get(ownerId);
      const found: AccountRecord[] = [];
      for (const id of new Set(ids)) {
        const r = accounts?.get(id);
        if (r) found.push({ ...r });
      }
      return found;
    });
  }
}
