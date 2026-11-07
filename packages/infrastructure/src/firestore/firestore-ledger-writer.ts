import type {
  Clock,
  CorrectionCommit,
  EntryRecord,
  LedgerCommit,
  LedgerCommitResult,
  LedgerWriter,
  TransactionRecord,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  DomainError,
  LedgerDate,
  assertBalanced,
  assertPostingAfterCutover,
  assertTransition,
  asAccountId,
  asTransactionId,
  isRealAccount,
  type AccountId,
  type AccountKind,
  type CurrencyCode,
  type CutoverMarker,
  type EntryDraft,
  type OwnerId,
  type TransactionId,
} from "@moneytrace/domain";
import type {
  DocumentReference,
  Firestore,
  Transaction as FirestoreTransaction,
} from "firebase-admin/firestore";
import { ownerPath } from "./paths";
import { bySequence, toEntryRecord, toTransactionRecord, transactionToDoc } from "./records";

/** Contended transactions are retried by Firestore; parallel replays of one key need headroom. */
const MAX_ATTEMPTS = 25;

type Delta = { kind: AccountKind; currency: CurrencyCode; minor: number };

/**
 * Every method is one `runTransaction`. Reads happen lazily as the checks need them, and every
 * write comes after the last check, so a failed check writes nothing. The checks and their order
 * mirror `InMemoryLedger`.
 */
export class FirestoreLedgerWriter implements LedgerWriter {
  private readonly db: Firestore;
  private readonly clock: Clock;

  constructor(db: Firestore, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private ref(ownerId: OwnerId, collection: Parameters<typeof ownerPath>[1], id: string) {
    return this.db.doc(ownerPath(ownerId, collection, id));
  }

  private async readTx(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    id: TransactionId,
  ): Promise<TransactionRecord | null> {
    const s = await t.get(this.ref(ownerId, "transactions", id));
    return s.exists ? toTransactionRecord(s.data()) : null;
  }

  private async replay(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    key: string,
    payloadHash: string,
  ): Promise<LedgerCommitResult | null> {
    const s = await t.get(this.ref(ownerId, "idempotencyRecords", `ledger:${key}`));
    if (!s.exists) return null;
    const seen = OWNER_COLLECTIONS.idempotencyRecords.parse(s.data());
    if (seen.payloadHash !== payloadHash) return { status: "idempotencyConflict" };
    if (seen.transactionId === undefined) {
      throw new Error("ledger idempotency record has no transaction id");
    }
    return { status: "duplicate", transactionId: asTransactionId(seen.transactionId) };
  }

  /** Stored markers for the real accounts among `entries` (plus `extra`), as the domain guard wants. */
  private async readMarkers(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    entries: readonly EntryDraft[],
    extra?: AccountId,
  ): Promise<CutoverMarker[]> {
    const ids = new Set<AccountId>(
      entries.filter((e) => isRealAccount(e.account)).map((e) => e.account.id),
    );
    if (extra !== undefined) ids.add(extra);
    if (ids.size === 0) return [];
    const snaps = await t.getAll(...[...ids].map((id) => this.ref(ownerId, "cutoverMarkers", id)));
    const markers: CutoverMarker[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = OWNER_COLLECTIONS.cutoverMarkers.parse(s.data());
      markers.push({
        accountId: asAccountId(d.accountId),
        effectiveAt: LedgerDate.fromEpochMs(d.effectiveAtMs),
      });
    }
    return markers;
  }

  /**
   * Any entry of the account dated at or before `ms` outside opening-balance transactions,
   * reversed or not. The entry schema carries no intent type, so the owning transactions are read
   * in the same Firestore transaction.
   */
  private async hasActivityUpTo(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    accountId: AccountId,
    ms: number,
  ): Promise<boolean> {
    const entries = await t.get(
      this.db
        .collection(ownerPath(ownerId, "ledgerEntries"))
        .where("accountId", "==", accountId)
        .where("occurredAtMs", "<=", ms),
    );
    const txIds = [...new Set(entries.docs.map((d) => toEntryRecord(d.data()).transactionId))];
    if (txIds.length === 0) return false;
    const txs = await t.getAll(...txIds.map((id) => this.ref(ownerId, "transactions", id)));
    return txs.some(
      (s) => !s.exists || toTransactionRecord(s.data()).intentType !== "openingBalance",
    );
  }

  private async readEntries(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    txId: TransactionId,
  ): Promise<EntryRecord[]> {
    const snap = await t.get(
      this.db.collection(ownerPath(ownerId, "ledgerEntries")).where("transactionId", "==", txId),
    );
    return snap.docs.map((d) => toEntryRecord(d.data())).sort(bySequence);
  }

  /** Stages the transaction document and its entries, and folds the entries into `deltas`. */
  private stage(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    rec: TransactionRecord,
    drafts: readonly EntryDraft[],
    deltas: Map<AccountId, Delta>,
    mode: "set" | "create",
  ): void {
    const txRef = this.ref(ownerId, "transactions", rec.id);
    const data = transactionToDoc(rec);
    if (mode === "create") t.create(txRef, data);
    else t.set(txRef, data);
    drafts.forEach((d, i) => {
      const entry = OWNER_COLLECTIONS.ledgerEntries.parse({
        id: `${rec.id}:${String(i + 1)}`,
        transactionId: rec.id,
        accountId: d.account.id,
        accountKind: d.account.kind,
        side: d.side,
        amountMinor: d.amount.minor,
        currency: d.amount.currency,
        occurredAtMs: rec.occurredAtMs,
      });
      // `create` never overwrites: an entry that exists makes the whole transaction fail.
      t.create(this.ref(ownerId, "ledgerEntries", `${rec.id}:${String(i + 1)}`), entry);
      const signed = d.side === "debit" ? d.amount.minor : -d.amount.minor;
      const prior = deltas.get(d.account.id);
      deltas.set(d.account.id, {
        kind: d.account.kind,
        currency: d.account.currency,
        minor: (prior?.minor ?? 0) + signed,
      });
    });
  }

  private async readBalances(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    ids: Iterable<AccountId>,
  ): Promise<Map<AccountId, { ref: DocumentReference; minor: number; version: number }>> {
    const refs = [...ids].map((id) => this.ref(ownerId, "balances", id));
    const out = new Map<AccountId, { ref: DocumentReference; minor: number; version: number }>();
    if (refs.length === 0) return out;
    for (const s of await t.getAll(...refs)) {
      const id = asAccountId(s.ref.id);
      const d = s.exists ? OWNER_COLLECTIONS.balances.parse(s.data()) : null;
      out.set(id, {
        ref: s.ref,
        minor: d?.debitMinusCreditMinor ?? 0,
        version: d?.version ?? 0,
      });
    }
    return out;
  }

  /** Reads the balances (the last reads), then writes every changed projection. */
  private async applyDeltas(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    touched: ReadonlySet<AccountId>,
    stageWrites: () => Map<AccountId, Delta>,
  ): Promise<void> {
    const balances = await this.readBalances(t, ownerId, touched);
    const deltas = stageWrites();
    for (const [id, delta] of deltas) {
      const current = balances.get(id);
      if (current === undefined) throw new Error("balance read missing");
      t.set(
        current.ref,
        OWNER_COLLECTIONS.balances.parse({
          accountId: id,
          accountKind: delta.kind,
          currency: delta.currency,
          debitMinusCreditMinor: current.minor + delta.minor,
          version: current.version + 1,
          updatedAtMs: this.clock.nowMs(),
        }),
      );
    }
  }

  private stageIdempotency(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    key: string,
    payloadHash: string,
    transactionId: TransactionId,
  ): void {
    t.create(
      this.ref(ownerId, "idempotencyRecords", `ledger:${key}`),
      OWNER_COLLECTIONS.idempotencyRecords.parse({
        key,
        payloadHash,
        transactionId,
        createdAtMs: this.clock.nowMs(),
      }),
    );
  }

  private stageMarker(
    t: FirestoreTransaction,
    ownerId: OwnerId,
    marker: CutoverMarker,
    transactionId: TransactionId,
  ): void {
    t.set(
      this.ref(ownerId, "cutoverMarkers", marker.accountId),
      OWNER_COLLECTIONS.cutoverMarkers.parse({
        accountId: marker.accountId,
        effectiveAtMs: marker.effectiveAt.epochMs,
        transactionId,
      }),
    );
  }

  commit(ownerId: OwnerId, c: LedgerCommit): Promise<LedgerCommitResult> {
    return this.db.runTransaction(
      async (t): Promise<LedgerCommitResult> => {
        const replay = await this.replay(t, ownerId, c.idempotencyKey, c.payloadHash);
        if (replay) return replay;

        if (c.transaction.state !== "posted") {
          throw new DomainError("invalidIntent", "a commit must carry a posted transaction");
        }
        const existing = await this.readTx(t, ownerId, c.transaction.id);
        assertTransition(existing?.state ?? null, "posted");
        if (c.entries.length > 0 || c.cutoverMarker === undefined) assertBalanced(c.entries);
        if (c.transaction.intentType === "openingBalance" && c.cutoverMarker === undefined) {
          throw new DomainError("invalidIntent", "an opening balance must carry a cutover marker");
        }
        if (c.transaction.intentType !== "openingBalance") {
          assertPostingAfterCutover(
            c.entries,
            LedgerDate.fromEpochMs(c.transaction.occurredAtMs),
            await this.readMarkers(t, ownerId, c.entries),
            c.requireCutoverMarker === true,
          );
        }
        if (c.cutoverMarker) {
          if (c.cutoverMarker.effectiveAt.epochMs !== c.transaction.occurredAtMs) {
            throw new DomainError("invalidIntent", "marker date must equal the transaction date");
          }
          const stored = await t.get(
            this.ref(ownerId, "cutoverMarkers", c.cutoverMarker.accountId),
          );
          if (stored.exists) return { status: "idempotencyConflict" };
          if (
            await this.hasActivityUpTo(
              t,
              ownerId,
              c.cutoverMarker.accountId,
              c.cutoverMarker.effectiveAt.epochMs,
            )
          ) {
            throw new DomainError(
              "cutoverHasActivity",
              "the account has activity before the opening",
            );
          }
        }

        await this.applyDeltas(t, ownerId, idsOf(c.entries), () => {
          const deltas = new Map<AccountId, Delta>();
          this.stage(t, ownerId, c.transaction, c.entries, deltas, existing ? "set" : "create");
          if (c.cutoverMarker) this.stageMarker(t, ownerId, c.cutoverMarker, c.transaction.id);
          this.stageIdempotency(t, ownerId, c.idempotencyKey, c.payloadHash, c.transaction.id);
          return deltas;
        });
        return { status: "committed", transactionId: c.transaction.id };
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  commitCorrection(ownerId: OwnerId, c: CorrectionCommit): Promise<LedgerCommitResult> {
    return this.db.runTransaction(
      async (t): Promise<LedgerCommitResult> => {
        const replay = await this.replay(t, ownerId, c.idempotencyKey, c.payloadHash);
        if (replay) return replay;

        const original = await this.readTx(t, ownerId, c.originalTransactionId);
        assertTransition(original?.state ?? null, "reversed");
        if (original === null) throw new DomainError("invalidTransition", "original not found");
        if (original.correctionOf !== undefined) {
          const parent = await this.readTx(t, ownerId, original.correctionOf);
          if (parent?.reversedBy === original.id) {
            throw new DomainError("invalidTransition", "a reversal cannot itself be reversed");
          }
        }
        if (c.reversal.state !== "posted" || c.reversal.correctionOf !== original.id) {
          throw new DomainError(
            "invalidIntent",
            "reversal must be posted and link to the original",
          );
        }
        const existingReversal = await this.readTx(t, ownerId, c.reversal.id);
        assertTransition(existingReversal?.state ?? null, "posted");
        assertMirrors(await this.readEntries(t, ownerId, original.id), c.reversalEntries);
        if (c.reversalEntries.length > 0) assertBalanced(c.reversalEntries);

        const isOpening = original.intentType === "openingBalance";
        if (isOpening !== (c.cutoverMarker !== undefined)) {
          throw new DomainError("invalidIntent", "only an opening correction carries a marker");
        }
        if (c.cutoverMarker) {
          const r = c.replacement;
          if (
            r === undefined ||
            r.transaction.occurredAtMs !== c.cutoverMarker.effectiveAt.epochMs
          ) {
            throw new DomainError(
              "invalidIntent",
              "an opening correction needs a dated replacement",
            );
          }
          const accountId = c.cutoverMarker.accountId;
          const currentSnap = await t.get(this.ref(ownerId, "cutoverMarkers", accountId));
          const current = currentSnap.exists
            ? OWNER_COLLECTIONS.cutoverMarkers.parse(currentSnap.data())
            : null;
          if (current?.transactionId !== original.id) {
            throw new DomainError("invalidIntent", "the marker does not belong to the original");
          }
          const newMs = c.cutoverMarker.effectiveAt.epochMs;
          if (
            newMs > current.effectiveAtMs &&
            (await this.hasActivityUpTo(t, ownerId, accountId, newMs))
          ) {
            throw new DomainError("cutoverHasActivity", "the account has earlier activity");
          }
        }
        let existingReplacement: TransactionRecord | null = null;
        if (c.replacement) {
          const r = c.replacement;
          if ((r.transaction.intentType === "openingBalance") !== isOpening) {
            throw new DomainError("invalidIntent", "replacement kind does not match the original");
          }
          if (r.transaction.correctionOf !== original.id) {
            throw new DomainError("invalidIntent", "replacement must link to the original");
          }
          if (!isOpening) {
            assertPostingAfterCutover(
              r.entries,
              LedgerDate.fromEpochMs(r.transaction.occurredAtMs),
              await this.readMarkers(t, ownerId, r.entries),
              r.requireCutoverMarker === true,
            );
          }
          if (r.transaction.state !== "posted") {
            throw new DomainError("invalidIntent", "replacement must be posted");
          }
          existingReplacement = await this.readTx(t, ownerId, r.transaction.id);
          assertTransition(existingReplacement?.state ?? null, "posted");
          if (r.entries.length > 0 || c.cutoverMarker === undefined) assertBalanced(r.entries);
        }

        const touched = idsOf([...c.reversalEntries, ...(c.replacement?.entries ?? [])]);
        await this.applyDeltas(t, ownerId, touched, () => {
          const staged = new Map<AccountId, Delta>();
          t.set(
            this.ref(ownerId, "transactions", original.id),
            transactionToDoc({ ...original, state: "reversed", reversedBy: c.reversal.id }),
          );
          this.stage(
            t,
            ownerId,
            c.reversal,
            c.reversalEntries,
            staged,
            existingReversal ? "set" : "create",
          );
          if (c.replacement) {
            this.stage(
              t,
              ownerId,
              c.replacement.transaction,
              c.replacement.entries,
              staged,
              existingReplacement ? "set" : "create",
            );
          }
          if (c.cutoverMarker) {
            this.stageMarker(
              t,
              ownerId,
              c.cutoverMarker,
              c.replacement?.transaction.id ?? original.id,
            );
          }
          this.stageIdempotency(t, ownerId, c.idempotencyKey, c.payloadHash, c.reversal.id);
          return staged;
        });
        return { status: "committed", transactionId: c.reversal.id };
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async savePending(ownerId: OwnerId, rec: TransactionRecord): Promise<void> {
    await this.db.runTransaction(
      async (t) => {
        const existing = await this.readTx(t, ownerId, rec.id);
        assertTransition(existing?.state ?? null, "pending");
        if (rec.state !== "pending") {
          throw new DomainError("invalidTransition", "state must be pending");
        }
        t.create(this.ref(ownerId, "transactions", rec.id), transactionToDoc(rec));
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}

/** The accounts a set of drafts touches, so their balances are read before any write. */
function idsOf(drafts: readonly EntryDraft[]): Set<AccountId> {
  return new Set(drafts.map((d) => d.account.id));
}

/** The reversal must be the stored entries with every side flipped, as a multiset. */
function assertMirrors(stored: readonly EntryRecord[], reversal: readonly EntryDraft[]): void {
  const key = (account: string, side: string, minor: number, currency: string): string =>
    `${account}|${side}|${String(minor)}|${currency}`;
  const want = stored
    .map((e) =>
      key(e.accountId, e.side === "debit" ? "credit" : "debit", e.amountMinor, e.currency),
    )
    .sort();
  const got = reversal
    .map((e) => key(e.account.id, e.side, e.amount.minor, e.amount.currency))
    .sort();
  if (want.length !== got.length || want.some((k, i) => k !== got[i])) {
    throw new DomainError("invalidIntent", "reversal entries must mirror the stored entries");
  }
}
