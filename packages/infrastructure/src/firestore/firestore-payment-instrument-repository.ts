import {
  instrumentMatches,
  type InstrumentQuery,
  type PaymentInstrumentRecord,
  type PaymentInstrumentRepository,
} from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { asAccountId, type OwnerId } from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { ownerPath } from "./paths";

export class FirestorePaymentInstrumentRepository implements PaymentInstrumentRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async create(ownerId: OwnerId, record: PaymentInstrumentRecord): Promise<void> {
    const data = OWNER_COLLECTIONS.paymentInstruments.parse({ ...record });
    await this.db.doc(ownerPath(ownerId, "paymentInstruments", record.id)).create(data);
  }

  async findForCandidate(
    ownerId: OwnerId,
    query: InstrumentQuery,
  ): Promise<PaymentInstrumentRecord[]> {
    const all = this.db.collection(ownerPath(ownerId, "paymentInstruments"));
    const snap = await (query.provider === undefined
      ? all.get()
      : all.where("provider", "==", query.provider).get());
    return snap.docs
      .map((d) => {
        const r = OWNER_COLLECTIONS.paymentInstruments.parse(d.data());
        return { ...r, linkedAccountId: asAccountId(r.linkedAccountId) };
      })
      .filter((r) => instrumentMatches(r, query));
  }
}
