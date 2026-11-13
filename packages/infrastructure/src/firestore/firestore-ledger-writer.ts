import {
  assertCommitShape,
  assertCorrectionShape,
  assertMirrors,
  type Clock,
  type CorrectionCommit,
  type EntryRecord,
  type LedgerCommit,
  type LedgerCommitResult,
  type LedgerWriter,
  type TransactionRecord,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  DomainError,
  LedgerDate,
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
import type { DocRef, DocStore, DocTransaction } from "../docstore/doc-store";
import { ownerPath } from "./paths";
import { bySequence, toEntryRecord, toTransactionRecord, transactionToDoc } from "./records";

const MAX_ATTEMPTS = 5;

type BalanceDoc = {
  accountKind: AccountKind;
  currency: CurrencyCode;
  debitMinusCreditMinor: number;
  version: number;
};

type Delta = { kind: AccountKind; currency: CurrencyCode; minor: number };

/**
 * Every method is one `runTransaction`. Reads happen lazily as the checks need them, and every
 * write comes after the last check, so a failed check writes nothing. The checks and their order
 * mirror `InMemoryLedger`.
 */
export class FirestoreLedgerWriter implements LedgerWriter {
  private readonly db: DocStore;
  private readonly clock: Clock;

  constructor(db: DocStore, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private ref(ownerId: OwnerId, collection: Parameters<typeof ownerPath>[1], id: string) {
    return this.db.doc(ownerPath(ownerId, collection, id));
  }

  private async readTx(
    t: DocTransaction,
    ownerId: OwnerId,
    id: TransactionId,
  ): Promise<TransactionRecord | null> {
    const s = await t.get(this.ref(ownerId, "transactions", id));
    return s.exists ? toTransactionRecord(s.data()) : null;
  }

  private async replay(
    t: DocTransaction,
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

  /** Stored markers for the real accounts among `entries`, as the domain guard wants. */
  private async readMarkers(
    t: DocTransaction,
    ownerId: OwnerId,
    entries: readonly EntryDraft[],
  ): Promise<CutoverMarker[]> {
    const ids = new Set<AccountId>(
      entries.filter((e) => isRealAccount(e.account)).map((e) => e.account.id),
    );
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
    t: DocTransaction,
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
    t: DocTransaction,
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
    t: DocTransaction,
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
    t: DocTransaction,
    ownerId: OwnerId,
    ids: Iterable<AccountId>,
  ): Promise<Map<AccountId, { ref: DocRef; data: BalanceDoc | null }>> {
    const refs = [...ids].map((id) => this.ref(ownerId, "balances", id));
    const out = new Map<AccountId, { ref: DocRef; data: BalanceDoc | null }>();
    if (refs.length === 0) return out;
    for (const s of await t.getAll(...refs)) {
      out.set(asAccountId(s.ref.id), {
        ref: s.ref,
        data: s.exists ? OWNER_COLLECTIONS.balances.parse(s.data()) : null,
      });
    }
    return out;
  }

  /** Reads the balances (the last reads), then writes every changed projection. */
  private async applyDeltas(
    t: DocTransaction,
    ownerId: OwnerId,
    touched: ReadonlySet<AccountId>,
    stageWrites: () => Map<AccountId, Delta>,
  ): Promise<void> {
    const balances = await this.readBalances(t, ownerId, touched);
    const deltas = stageWrites();
    for (const [id, current] of balances) {
      const delta = deltas.get(id);
      const prior = current.data;
      // An account with no entries and no stored balance (an empty opening) has no kind to store.
      const kind = delta?.kind ?? prior?.accountKind;
      const currency = delta?.currency ?? prior?.currency;
      if (kind === undefined || currency === undefined) continue;
      t.set(
        current.ref,
        OWNER_COLLECTIONS.balances.parse({
          accountId: id,
          accountKind: kind,
          currency,
          debitMinusCreditMinor: (prior?.debitMinusCreditMinor ?? 0) + (delta?.minor ?? 0),
          version: (prior?.version ?? 0) + 1,
          updatedAtMs: this.clock.nowMs(),
        }),
      );
    }
  }

  private stageIdempotency(
    t: DocTransaction,
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
    t: DocTransaction,
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

        assertCommitShape(c);
        const existing = await this.readTx(t, ownerId, c.transaction.id);
        assertTransition(existing?.state ?? null, "posted");
        if (c.transaction.intentType !== "openingBalance") {
          assertPostingAfterCutover(
            c.entries,
            LedgerDate.fromEpochMs(c.transaction.occurredAtMs),
            await this.readMarkers(t, ownerId, c.entries),
            c.requireCutoverMarker === true,
          );
        }
        if (c.cutoverMarker) {
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

        await this.applyDeltas(t, ownerId, idsOf(c.entries, c.cutoverMarker), () => {
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
        assertCorrectionShape(original, c);
        const existingReversal = await this.readTx(t, ownerId, c.reversal.id);
        assertTransition(existingReversal?.state ?? null, "posted");
        assertMirrors(await this.readEntries(t, ownerId, original.id), c.reversalEntries);

        const isOpening = original.intentType === "openingBalance";
        if (c.cutoverMarker) {
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
          if (!isOpening) {
            assertPostingAfterCutover(
              r.entries,
              LedgerDate.fromEpochMs(r.transaction.occurredAtMs),
              await this.readMarkers(t, ownerId, r.entries),
              r.requireCutoverMarker === true,
            );
          }
          existingReplacement = await this.readTx(t, ownerId, r.transaction.id);
          assertTransition(existingReplacement?.state ?? null, "posted");
        }
        if (c.alsoPost) {
          const extra = c.alsoPost;
          assertPostingAfterCutover(
            extra.entries,
            LedgerDate.fromEpochMs(extra.transaction.occurredAtMs),
            await this.readMarkers(t, ownerId, extra.entries),
            false,
          );
          if ((await this.readTx(t, ownerId, extra.transaction.id)) !== null) {
            throw new DomainError("invalidTransition", "that transaction already exists");
          }
        }

        const touched = idsOf(
          [...c.reversalEntries, ...(c.replacement?.entries ?? []), ...(c.alsoPost?.entries ?? [])],
          c.cutoverMarker,
        );
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
          if (c.alsoPost) {
            this.stage(t, ownerId, c.alsoPost.transaction, c.alsoPost.entries, staged, "create");
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

/**
 * The accounts whose balances are read before any write: those the entries touch, and an
 * opening's marker account even when it has no entries. Reading (and rewriting) that balance
 * document gives the opening a document-level conflict with any concurrent posting there, which
 * the activity query alone would not guarantee.
 */
function idsOf(drafts: readonly EntryDraft[], marker?: CutoverMarker): Set<AccountId> {
  const ids = new Set(drafts.map((d) => d.account.id));
  if (marker) ids.add(marker.accountId);
  return ids;
}
