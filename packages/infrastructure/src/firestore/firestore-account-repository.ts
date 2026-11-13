import type { AccountRecord, AccountRepository, Clock } from "@moneytrace/application";
import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import { asAccountId, type AccountId, type OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { ownerPath } from "./paths";

function toRecord(data: unknown): AccountRecord {
  const d = OWNER_COLLECTIONS.accounts.parse(data);
  return {
    id: asAccountId(d.id),
    kind: d.kind,
    name: d.name,
    currency: d.currency,
    status: d.status,
    createdAtMs: d.createdAtMs,
  };
}

export class FirestoreAccountRepository implements AccountRepository {
  private readonly db: DocStore;

  // The clock is accepted so all three adapters share one constructor shape; reads need no time.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(db: DocStore, _clock: Clock) {
    this.db = db;
  }

  async create(ownerId: OwnerId, record: AccountRecord): Promise<void> {
    const data = OWNER_COLLECTIONS.accounts.parse({ ...record });
    // `create` fails when the document exists, so an account is never overwritten.
    await this.db.doc(ownerPath(ownerId, "accounts", record.id)).create(data);
  }

  async ensure(ownerId: OwnerId, record: AccountRecord): Promise<void> {
    const data = OWNER_COLLECTIONS.accounts.parse({ ...record });
    const ref = this.db.doc(ownerPath(ownerId, "accounts", record.id));
    await this.db.runTransaction(async (t) => {
      if (!(await t.get(ref)).exists) t.create(ref, data);
    });
  }

  async list(ownerId: OwnerId): Promise<AccountRecord[]> {
    const snap = await this.db.collection(ownerPath(ownerId, "accounts")).get();
    return snap.docs.map((s) => toRecord(s.data()));
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
      found.push(toRecord(s.data()));
    }
    return found;
  }
}
