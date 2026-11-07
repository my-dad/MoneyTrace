import type { AccountRecord, AccountRepository, Clock } from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { asAccountId, type AccountId, type OwnerId } from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { ownerPath } from "./paths";

export class FirestoreAccountRepository implements AccountRepository {
  private readonly db: Firestore;

  // The clock is accepted so all three adapters share one constructor shape; reads need no time.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(db: Firestore, _clock: Clock) {
    this.db = db;
  }

  async create(ownerId: OwnerId, record: AccountRecord): Promise<void> {
    const data = OWNER_COLLECTIONS.accounts.parse({ ...record });
    // `create` fails when the document exists, so an account is never overwritten.
    await this.db.doc(ownerPath(ownerId, "accounts", record.id)).create(data);
  }

  async getMany(ownerId: OwnerId, ids: readonly AccountId[]): Promise<AccountRecord[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const snaps = await this.db.getAll(
      ...unique.map((id) => this.db.doc(ownerPath(ownerId, "accounts", id))),
    );
    const found: AccountRecord[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const d = OWNER_COLLECTIONS.accounts.parse(s.data());
      found.push({
        id: asAccountId(d.id),
        kind: d.kind,
        name: d.name,
        currency: d.currency,
        status: d.status,
        createdAtMs: d.createdAtMs,
      });
    }
    return found;
  }
}
