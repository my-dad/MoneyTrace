import type { EntryRecord, TransactionRecord } from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { asAccountId, asSourceEventId, asTransactionId } from "@moneytrace/domain";

/** Firestore rejects `undefined` values, so optional fields are written only when present. */
export function transactionToDoc(t: TransactionRecord): Record<string, unknown> {
  return OWNER_COLLECTIONS.transactions.parse({
    id: t.id,
    state: t.state,
    intentType: t.intentType,
    occurredAtMs: t.occurredAtMs,
    currency: t.currency,
    sourceEventIds: [...t.sourceEventIds],
    actor: t.actor,
    ...(t.rationale !== undefined ? { rationale: t.rationale } : {}),
    ...(t.correctionOf !== undefined ? { correctionOf: t.correctionOf } : {}),
    ...(t.reversedBy !== undefined ? { reversedBy: t.reversedBy } : {}),
    ...(t.auditDetails !== undefined ? { auditDetails: { ...t.auditDetails } } : {}),
    committedAtMs: t.committedAtMs,
  });
}

export function toTransactionRecord(data: unknown): TransactionRecord {
  const d = OWNER_COLLECTIONS.transactions.parse(data);
  return {
    id: asTransactionId(d.id),
    state: d.state,
    intentType: d.intentType,
    occurredAtMs: d.occurredAtMs,
    currency: d.currency,
    sourceEventIds: d.sourceEventIds.map(asSourceEventId),
    actor: d.actor,
    ...(d.rationale !== undefined ? { rationale: d.rationale } : {}),
    ...(d.correctionOf !== undefined ? { correctionOf: asTransactionId(d.correctionOf) } : {}),
    ...(d.reversedBy !== undefined ? { reversedBy: asTransactionId(d.reversedBy) } : {}),
    ...(d.auditDetails !== undefined
      ? {
          auditDetails: {
            ...(d.auditDetails.cause !== undefined ? { cause: d.auditDetails.cause } : {}),
            ...(d.auditDetails.authorizedBy !== undefined
              ? { authorizedBy: d.auditDetails.authorizedBy }
              : {}),
            ...(d.auditDetails.holderName !== undefined
              ? { holderName: d.auditDetails.holderName }
              : {}),
          },
        }
      : {}),
    committedAtMs: d.committedAtMs,
  };
}

export function toEntryRecord(data: unknown): EntryRecord {
  const d = OWNER_COLLECTIONS.ledgerEntries.parse(data);
  return {
    id: d.id,
    transactionId: asTransactionId(d.transactionId),
    accountId: asAccountId(d.accountId),
    accountKind: d.accountKind,
    side: d.side,
    amountMinor: d.amountMinor,
    currency: d.currency,
    occurredAtMs: d.occurredAtMs,
  };
}

/** Entry IDs are `<transactionId>:<seq>`; order by the numeric sequence. */
export function bySequence(a: EntryRecord, b: EntryRecord): number {
  const seq = (e: EntryRecord): number => Number(e.id.slice(e.id.lastIndexOf(":") + 1));
  return seq(a) - seq(b);
}
