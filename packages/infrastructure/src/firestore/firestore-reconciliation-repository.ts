import type {
  FollowUpRecord,
  ReconciliationRecord,
  ReconciliationRepository,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { ownerPath } from "./paths";

const MAX_ATTEMPTS = 5;

const toRecord = (data: unknown): ReconciliationRecord =>
  OWNER_COLLECTIONS.reconciliations.parse(data);

export class FirestoreReconciliationRepository implements ReconciliationRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  private ref(ownerId: OwnerId, id: string) {
    return this.db.doc(ownerPath(ownerId, "reconciliations", id));
  }

  async get(ownerId: OwnerId, id: string): Promise<ReconciliationRecord | null> {
    const s = await this.ref(ownerId, id).get();
    return s.exists ? toRecord(s.data()) : null;
  }

  recordCount(
    ownerId: OwnerId,
    record: ReconciliationRecord,
    followUp: FollowUpRecord | null,
  ): Promise<"created" | "exists"> {
    const data = OWNER_COLLECTIONS.reconciliations.parse(record);
    const question = followUp === null ? null : OWNER_COLLECTIONS.followUps.parse(followUp);
    const ref = this.ref(ownerId, record.id);
    return this.db.runTransaction(
      async (t) => {
        if ((await t.get(ref)).exists) return "exists" as const;
        t.create(ref, data);
        if (question !== null) {
          t.create(this.db.doc(ownerPath(ownerId, "followUps", question.id)), question);
        }
        return "created" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }

  async listOpenCashCounts(ownerId: OwnerId): Promise<ReconciliationRecord[]> {
    const snap = await this.db
      .collection(ownerPath(ownerId, "reconciliations"))
      .where("reviewStatus", "==", "open")
      .get();
    return snap.docs.map((d) => toRecord(d.data())).filter((r) => r.kind === "cashCount");
  }

  markStatus(
    ownerId: OwnerId,
    id: string,
    status: "adjusted" | "dismissed",
    adjustmentTransactionId: string | null,
    nowMs: number,
  ): Promise<"updated" | "notOpen"> {
    const ref = this.ref(ownerId, id);
    return this.db.runTransaction(
      async (t) => {
        const s = await t.get(ref);
        if (!s.exists) return "notOpen" as const;
        const r = toRecord(s.data());
        if (r.reviewStatus !== "open") return "notOpen" as const;
        t.set(
          ref,
          OWNER_COLLECTIONS.reconciliations.parse({
            ...r,
            reviewStatus: status,
            adjustmentTransactionIds:
              adjustmentTransactionId === null
                ? r.adjustmentTransactionIds
                : [...r.adjustmentTransactionIds, adjustmentTransactionId],
            updatedAtMs: nowMs,
          }),
        );
        return "updated" as const;
      },
      { maxAttempts: MAX_ATTEMPTS },
    );
  }
}
