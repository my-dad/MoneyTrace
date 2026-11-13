import {
  aiUsageToDoc,
  toAiUsageRecord,
  utcDayRange,
  type AIUsageRecord,
  type AIUsageRecorder,
} from "@moneytrace/application";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { ownerPath } from "./paths";

/** The document ID is the record ID, so appending one attempt twice keeps one document. */
export class FirestoreAiUsageRecorder implements AIUsageRecorder {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  async append(ownerId: OwnerId, record: AIUsageRecord): Promise<void> {
    const doc = aiUsageToDoc(record);
    await this.db.doc(ownerPath(ownerId, "aiUsage", record.id)).set(doc);
  }

  /** `create` fails with ALREADY_EXISTS (gRPC 6) when the row is there, which is the answer. */
  async appendIfAbsent(ownerId: OwnerId, record: AIUsageRecord): Promise<"created" | "exists"> {
    const doc = aiUsageToDoc(record);
    try {
      await this.db.doc(ownerPath(ownerId, "aiUsage", record.id)).create(doc);
      return "created";
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 6) {
        return "exists";
      }
      throw error;
    }
  }

  /** One range on `createdAtMs`: Firestore's automatic single-field index serves it. */
  async listForUtcDay(ownerId: OwnerId, day: string): Promise<AIUsageRecord[]> {
    const { startMs, endMs } = utcDayRange(day);
    const snap = await this.db
      .collection(ownerPath(ownerId, "aiUsage"))
      .where("createdAtMs", ">=", startMs)
      .where("createdAtMs", "<", endMs)
      .get();
    return snap.docs.map((d) => toAiUsageRecord(d.data()));
  }
}
