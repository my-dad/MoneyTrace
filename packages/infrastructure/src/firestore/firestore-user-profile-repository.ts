import type {
  ProfilePatch,
  UserProfileDefaults,
  UserProfileRepository,
} from "@moneytrace/application";
import { userProfileSchema } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { DocStore } from "../docstore/doc-store";
import { userPath } from "./paths";

/** gRPC ALREADY_EXISTS, which Firestore returns when `create` meets an existing document. */
const ALREADY_EXISTS = 6;

export class FirestoreUserProfileRepository implements UserProfileRepository {
  private readonly db: DocStore;

  constructor(db: DocStore) {
    this.db = db;
  }

  async update(ownerId: OwnerId, patch: ProfilePatch): Promise<void> {
    const ref = this.db.doc(userPath(ownerId));
    await this.db.runTransaction(async (t) => {
      const s = await t.get(ref);
      t.set(ref, userProfileSchema.parse({ ...s.data(), ...patch }));
    });
  }

  async recordVisit(ownerId: OwnerId, nowMs: number): Promise<number | null> {
    const ref = this.db.doc(userPath(ownerId));
    return this.db.runTransaction(async (t) => {
      const s = await t.get(ref);
      const current = userProfileSchema.parse(s.data());
      const previous = current.lastSeenAtMs ?? null;
      if (previous === null || nowMs > previous) t.set(ref, userProfileSchema.parse({ ...current, lastSeenAtMs: nowMs }));
      return previous;
    });
  }

  async get(ownerId: OwnerId): Promise<UserProfileDefaults | null> {
    const snap = await this.db.doc(userPath(ownerId)).get();
    return snap.exists ? (userProfileSchema.parse(snap.data()) as UserProfileDefaults) : null;
  }

  async createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean> {
    const data = userProfileSchema.parse({ ...defaults });
    try {
      await this.db.doc(userPath(ownerId)).create(data);
      return true;
    } catch (e) {
      if (
        typeof e === "object" &&
        e !== null &&
        (e as { code?: unknown }).code === ALREADY_EXISTS
      ) {
        return false;
      }
      throw e;
    }
  }
}
