import {
  DomainError,
  LedgerDate,
  assertTransition,
  type AccountId,
  type CutoverMarker,
  assertPostingAfterCutover,
  type EntryDraft,
  type OwnerId,
  type TransactionId,
} from "@moneytrace/domain";
import { assertCommitShape, assertCorrectionShape, assertMirrors } from "../ledger-guards";
import type { AccountRecord, AccountRepository } from "../ports/account-repository";
import type {
  EntryRecord,
  LedgerReader,
  StoredCutoverMarker,
  TransactionRecord,
} from "../ports/ledger-reader";
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
  markers: Map<string, { effectiveAtMs: number; transactionId: TransactionId }>;
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

function markersOf(s: OwnerLedger): CutoverMarker[] {
  return [...s.markers].map(([accountId, m]) => ({
    accountId: accountId as AccountId,
    effectiveAt: LedgerDate.fromEpochMs(m.effectiveAtMs),
  }));
}

/** Any non-opening entry on the account dated at or before `ms`, reversed or not. */
function hasActivityUpTo(s: OwnerLedger, accountId: string, ms: number): boolean {
  for (const [txId, list] of s.entries) {
    if (s.transactions.get(txId)?.intentType === "openingBalance") continue;
    if (list.some((e) => e.accountId === accountId && e.occurredAtMs <= ms)) return true;
  }
  return false;
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

      assertCommitShape(c);
      assertTransition(s.transactions.get(c.transaction.id)?.state ?? null, "posted");
      if (c.transaction.intentType !== "openingBalance") {
        assertPostingAfterCutover(
          c.entries,
          LedgerDate.fromEpochMs(c.transaction.occurredAtMs),
          markersOf(s),
          c.requireCutoverMarker === true,
        );
      }
      if (c.cutoverMarker) {
        if (s.markers.has(c.cutoverMarker.accountId)) return { status: "idempotencyConflict" };
        if (hasActivityUpTo(s, c.cutoverMarker.accountId, c.cutoverMarker.effectiveAt.epochMs)) {
          throw new DomainError(
            "cutoverHasActivity",
            "the account has activity before the opening",
          );
        }
      }

      InMemoryLedger.write(s, c.transaction, c.entries);
      if (c.cutoverMarker) {
        s.markers.set(c.cutoverMarker.accountId, {
          effectiveAtMs: c.cutoverMarker.effectiveAt.epochMs,
          transactionId: c.transaction.id,
        });
      }
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
      if (original.correctionOf !== undefined) {
        const parent = s.transactions.get(original.correctionOf);
        if (parent?.reversedBy === original.id) {
          throw new DomainError("invalidTransition", "a reversal cannot itself be reversed");
        }
      }
      assertCorrectionShape(original, c);
      assertTransition(s.transactions.get(c.reversal.id)?.state ?? null, "posted");
      assertMirrors(s.entries.get(original.id) ?? [], c.reversalEntries);

      const isOpening = original.intentType === "openingBalance";
      if (c.cutoverMarker) {
        const accountId = c.cutoverMarker.accountId;
        const current = s.markers.get(accountId);
        if (current?.transactionId !== original.id) {
          throw new DomainError("invalidIntent", "the marker does not belong to the original");
        }
        const newMs = c.cutoverMarker.effectiveAt.epochMs;
        if (newMs > current.effectiveAtMs && hasActivityUpTo(s, accountId, newMs)) {
          throw new DomainError("cutoverHasActivity", "the account has earlier activity");
        }
      }
      if (c.replacement) {
        const r = c.replacement;
        if (!isOpening) {
          assertPostingAfterCutover(
            r.entries,
            LedgerDate.fromEpochMs(r.transaction.occurredAtMs),
            markersOf(s),
            r.requireCutoverMarker === true,
          );
        }
        assertTransition(s.transactions.get(r.transaction.id)?.state ?? null, "posted");
      }
      if (c.alsoPost) {
        const extra = c.alsoPost;
        assertPostingAfterCutover(
          extra.entries,
          LedgerDate.fromEpochMs(extra.transaction.occurredAtMs),
          markersOf(s),
          false,
        );
        if (s.transactions.has(extra.transaction.id)) {
          throw new DomainError("invalidTransition", "that transaction already exists");
        }
      }

      s.transactions.set(original.id, {
        ...original,
        state: "reversed",
        reversedBy: c.reversal.id,
      });
      InMemoryLedger.write(s, c.reversal, c.reversalEntries);
      if (c.replacement) InMemoryLedger.write(s, c.replacement.transaction, c.replacement.entries);
      if (c.alsoPost) InMemoryLedger.write(s, c.alsoPost.transaction, c.alsoPost.entries);
      if (c.cutoverMarker) {
        s.markers.set(c.cutoverMarker.accountId, {
          effectiveAtMs: c.cutoverMarker.effectiveAt.epochMs,
          transactionId: c.replacement?.transaction.id ?? original.id,
        });
      }
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

  getCutoverMarkers(
    ownerId: OwnerId,
    accountIds: readonly AccountId[],
  ): Promise<StoredCutoverMarker[]> {
    return atomically(() => {
      const found: StoredCutoverMarker[] = [];
      for (const id of new Set(accountIds)) {
        const m = this.of(ownerId).markers.get(id);
        if (m !== undefined) {
          found.push({
            accountId: id,
            effectiveAt: LedgerDate.fromEpochMs(m.effectiveAtMs),
            transactionId: m.transactionId,
          });
        }
      }
      return found;
    });
  }

  listEntriesInRange(ownerId: OwnerId, fromMs: number, toMs: number): Promise<EntryRecord[]> {
    return atomically(() =>
      [...this.of(ownerId).entries.values()]
        .flat()
        .filter((e) => e.occurredAtMs >= fromMs && e.occurredAtMs <= toMs)
        .map((e) => ({ ...e })),
    );
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

  ensure(ownerId: OwnerId, record: AccountRecord): Promise<void> {
    return atomically(() => {
      const accounts = this.owners.get(ownerId) ?? new Map<string, AccountRecord>();
      this.owners.set(ownerId, accounts);
      if (!accounts.has(record.id)) accounts.set(record.id, { ...record });
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
