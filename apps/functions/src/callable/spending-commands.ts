import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

/** Sorts a merchant into a sector: remembered for later SMS, and earlier spending re-sorted. */
export const tagMerchant = command(COMMANDS.tagMerchant, (ctx, data) =>
  ctx.deps.tagMerchant.execute({ ownerId: ctx.ownerId, ...data }),
);
