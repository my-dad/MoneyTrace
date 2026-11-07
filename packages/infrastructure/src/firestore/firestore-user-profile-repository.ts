import type { UserProfileDefaults, UserProfileRepository } from "@moneytrace/application";
import { userProfileSchema } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";
import type { Firestore } from "firebase-admin/firestore";
import { userPath } from "./paths";

/** gRPC ALREADY_EXISTS, which Firestore returns when `create` meets an existing document. */
const ALREADY_EXISTS = 6;

export class FirestoreUserProfileRepository implements UserProfileRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
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
