import { DomainError, type OwnerId } from "@moneytrace/domain";
import type { TipsDoc, TipsFields, TipsRepository } from "../ports/tips-repository";

/** A deep copy, so a caller never holds the stored object (the document is plain JSON). */
const copy = (doc: TipsDoc): TipsDoc => JSON.parse(JSON.stringify(doc)) as TipsDoc;

export class InMemoryTips implements TipsRepository {
  private readonly rows = new Map<string, TipsDoc>();

  get(ownerId: OwnerId): Promise<TipsDoc | null> {
    const row = this.rows.get(ownerId);
    return Promise.resolve(row === undefined ? null : copy(row));
  }

  update(ownerId: OwnerId, next: (current: TipsDoc | null) => TipsFields | null): Promise<TipsDoc | null> {
    const current = this.rows.get(ownerId) ?? null;
    const fields = next(current === null ? null : copy(current));
    if (fields === null) return Promise.resolve(current === null ? null : copy(current));
    const stored = copy({ ...fields, id: "current", forcedDay: current?.forcedDay ?? null, forcedToday: current?.forcedToday ?? 0 });
    this.rows.set(ownerId, stored);
    return Promise.resolve(copy(stored));
  }

  claimForced(ownerId: OwnerId, dhakaDay: string, max: number): Promise<number | null> {
    const current = this.rows.get(ownerId);
    if (current === undefined) return Promise.reject(new DomainError("resourceNotFound", "no tips yet"));
    const used = current.forcedDay === dhakaDay ? current.forcedToday : 0;
    if (used >= max) return Promise.resolve(null);
    this.rows.set(ownerId, { ...current, forcedDay: dhakaDay, forcedToday: used + 1 });
    return Promise.resolve(used + 1);
  }
}
