import type { OwnerId } from "@moneytrace/domain";
import type { FollowUpRecord } from "../ports/follow-up-repository";
import type {
  ReconciliationRecord,
  ReconciliationRepository,
} from "../ports/reconciliation-repository";
import type { InMemoryFollowUps } from "./in-memory-follow-ups";

const copy = (r: ReconciliationRecord): ReconciliationRecord => ({
  ...r,
  adjustmentTransactionIds: [...r.adjustmentTransactionIds],
});

/** Writes questions into the given follow-up store, as Firestore writes both in one transaction. */
export class InMemoryReconciliations implements ReconciliationRepository {
  private readonly owners = new Map<string, Map<string, ReconciliationRecord>>();
  private readonly followUps: InMemoryFollowUps;

  constructor(followUps: InMemoryFollowUps) {
    this.followUps = followUps;
  }

  private of(ownerId: OwnerId): Map<string, ReconciliationRecord> {
    let rows = this.owners.get(ownerId);
    if (rows === undefined) {
      rows = new Map();
      this.owners.set(ownerId, rows);
    }
    return rows;
  }

  get(ownerId: OwnerId, id: string): Promise<ReconciliationRecord | null> {
    const r = this.of(ownerId).get(id);
    return Promise.resolve(r === undefined ? null : copy(r));
  }

  recordCount(
    ownerId: OwnerId,
    record: ReconciliationRecord,
    followUp: FollowUpRecord | null,
  ): Promise<"created" | "exists"> {
    const rows = this.of(ownerId);
    if (rows.has(record.id)) return Promise.resolve("exists");
    rows.set(record.id, copy(record));
    if (followUp !== null) this.followUps.seed(ownerId, followUp);
    return Promise.resolve("created");
  }

  listOpenCashCounts(ownerId: OwnerId): Promise<ReconciliationRecord[]> {
    return Promise.resolve(
      [...this.of(ownerId).values()]
        .filter((r) => r.kind === "cashCount" && r.reviewStatus === "open")
        .map((r) => copy(r)),
    );
  }

  markStatus(
    ownerId: OwnerId,
    id: string,
    status: "adjusted" | "dismissed",
    adjustmentTransactionId: string | null,
    nowMs: number,
  ): Promise<"updated" | "notOpen"> {
    const rows = this.of(ownerId);
    const r = rows.get(id);
    if (r?.reviewStatus !== "open") return Promise.resolve("notOpen");
    rows.set(id, {
      ...r,
      reviewStatus: status,
      adjustmentTransactionIds:
        adjustmentTransactionId === null
          ? r.adjustmentTransactionIds
          : [...r.adjustmentTransactionIds, adjustmentTransactionId],
      updatedAtMs: nowMs,
    });
    return Promise.resolve("updated");
  }
}
