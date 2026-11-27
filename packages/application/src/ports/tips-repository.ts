import type { TipsDocument } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";

/** The stored `tips/current` document. */
export type TipsDoc = TipsDocument;
/** Everything `save` writes; the "New tips" count is only ever changed by `claimForced`. */
export type TipsFields = Omit<TipsDoc, "id" | "forcedDay" | "forcedToday">;

export type TipsRepository = {
  get(ownerId: OwnerId): Promise<TipsDoc | null>;
  /**
   * One atomic read-modify-write: `next` sees what is stored now (null before the first) and
   * returns the fields to store, or null to leave it as it is. The "New tips" count is kept (a first
   * write starts it at zero). Returns what is stored afterwards. `next` may run more than once.
   */
  update(ownerId: OwnerId, next: (current: TipsDoc | null) => TipsFields | null): Promise<TipsDoc | null>;
  /**
   * Atomically counts one "New tips" attempt on `dhakaDay` (a new day starts again from zero) and
   * returns its number from 1, or null once `max` were already made that day. The document must
   * exist (`resourceNotFound` otherwise).
   */
  claimForced(ownerId: OwnerId, dhakaDay: string, max: number): Promise<number | null>;
};
