import type { TipsDocument } from "@moneytrace/contracts";
import type { OwnerId } from "@moneytrace/domain";

/** The stored `tips/current` document. */
export type TipsDoc = TipsDocument;
/** Everything `save` writes; the "New tips" count is only ever changed by `claimForced`. */
export type TipsFields = Omit<TipsDoc, "id" | "forcedDay" | "forcedToday">;

export type TipsRepository = {
  get(ownerId: OwnerId): Promise<TipsDoc | null>;
  /** Merges the fields in, keeping the "New tips" count; a first save starts it at zero. */
  save(ownerId: OwnerId, fields: TipsFields): Promise<void>;
  /**
   * Atomically counts one "New tips" attempt on `dhakaDay` (a new day starts again from zero) and
   * returns its number from 1, or null once `max` were already made that day. The document must
   * exist (`resourceNotFound` otherwise).
   */
  claimForced(ownerId: OwnerId, dhakaDay: string, max: number): Promise<number | null>;
};
