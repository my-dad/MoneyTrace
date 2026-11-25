import type { OwnerId } from "@moneytrace/domain";
import type { ProfilePatch, UserProfileDefaults, UserProfileRepository } from "../ports/user-profile-repository";

const copy = <T>(p: T): T => JSON.parse(JSON.stringify(p)) as T;

export class InMemoryProfiles implements UserProfileRepository {
  private readonly docs = new Map<string, UserProfileDefaults>();

  update(ownerId: OwnerId, patch: ProfilePatch): Promise<void> {
    const doc = this.docs.get(ownerId);
    if (doc === undefined) return Promise.reject(new Error("no profile"));
    this.docs.set(ownerId, { ...doc, ...copy(patch) });
    return Promise.resolve();
  }

  get(ownerId: OwnerId): Promise<UserProfileDefaults | null> {
    const doc = this.docs.get(ownerId);
    return Promise.resolve(doc === undefined ? null : copy(doc));
  }

  createIfAbsent(ownerId: OwnerId, defaults: UserProfileDefaults): Promise<boolean> {
    if (this.docs.has(ownerId)) return Promise.resolve(false);
    this.docs.set(ownerId, copy(defaults));
    return Promise.resolve(true);
  }

  recordVisit(ownerId: OwnerId, nowMs: number): Promise<number | null> {
    const doc = this.docs.get(ownerId);
    if (doc === undefined) return Promise.reject(new Error("no profile"));
    const previous = doc.lastSeenAtMs ?? null;
    if (previous === null || nowMs > previous) this.docs.set(ownerId, { ...doc, lastSeenAtMs: nowMs });
    return Promise.resolve(previous);
  }
}
