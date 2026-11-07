import type { OwnerId } from "@moneytrace/domain";
import { decideResolve, decideSnooze, decideWake } from "../follow-up-guards";
import type { FollowUpRecord, FollowUpRepository } from "../ports/follow-up-repository";

export class InMemoryFollowUps implements FollowUpRepository {
  private readonly owners = new Map<string, Map<string, FollowUpRecord>>();

  private of(ownerId: OwnerId): Map<string, FollowUpRecord> {
    let rows = this.owners.get(ownerId);
    if (rows === undefined) {
      rows = new Map();
      this.owners.set(ownerId, rows);
    }
    return rows;
  }

  /** Test setup, standing in for the stage output that creates a follow-up. */
  seed(ownerId: OwnerId, record: FollowUpRecord): void {
    this.of(ownerId).set(record.id, { ...record });
  }

  get(ownerId: OwnerId, id: string): Promise<FollowUpRecord | null> {
    const f = this.of(ownerId).get(id);
    return Promise.resolve(f === undefined ? null : { ...f });
  }

  listOpen(ownerId: OwnerId): Promise<FollowUpRecord[]> {
    return Promise.resolve(
      [...this.of(ownerId).values()].filter((f) => f.state === "open").map((f) => ({ ...f })),
    );
  }

  private apply<R extends string>(
    ownerId: OwnerId,
    id: string,
    decide: (f: FollowUpRecord) => FollowUpRecord | null,
    done: R,
  ): "missing" | "refused" | R {
    const f = this.of(ownerId).get(id);
    if (f === undefined) return "missing";
    const next = decide(f);
    if (next === null) return "refused";
    this.of(ownerId).set(id, next);
    return done;
  }

  resolve(
    ownerId: OwnerId,
    id: string,
    resolution: string,
    nowMs: number,
  ): Promise<"resolved" | "alreadyClosed"> {
    const r = this.apply(ownerId, id, (f) => decideResolve(f, resolution, nowMs), "resolved");
    return Promise.resolve(r === "resolved" ? r : "alreadyClosed");
  }

  snooze(ownerId: OwnerId, id: string, untilMs: number): Promise<"snoozed" | "alreadyClosed"> {
    const r = this.apply(ownerId, id, (f) => decideSnooze(f, untilMs), "snoozed");
    return Promise.resolve(r === "snoozed" ? r : "alreadyClosed");
  }

  pushDue(ownerId: OwnerId, id: string, dueAtMs: number): Promise<void> {
    this.apply(ownerId, id, (f) => ({ ...f, dueAtMs }), "done");
    return Promise.resolve();
  }

  listDueToWake(nowMs: number, limit: number): Promise<{ ownerId: OwnerId; id: string }[]> {
    const rows: { ownerId: OwnerId; id: string }[] = [];
    for (const [ownerId, map] of this.owners) {
      for (const f of map.values()) {
        if (decideWake(f, nowMs) !== null) rows.push({ ownerId: ownerId as OwnerId, id: f.id });
      }
    }
    return Promise.resolve(rows.slice(0, limit));
  }

  wake(ownerId: OwnerId, id: string, nowMs: number): Promise<"woken" | "notSnoozed"> {
    const r = this.apply(ownerId, id, (f) => decideWake(f, nowMs), "woken");
    return Promise.resolve(r === "woken" ? r : "notSnoozed");
  }
}
