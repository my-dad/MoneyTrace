import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

/** Sorts a merchant into a sector: remembered for later SMS, and earlier spending re-sorted. */
/** Cash income the user typed in, recorded into cash in hand. */
export const recordCashIncome = command(COMMANDS.recordCashIncome, (ctx, data) =>
  ctx.deps.recordCashIncome.execute({ ownerId: ctx.ownerId, ...data }),
);

/** Fixes cash income the user added. */
export const editManualIncome = command(COMMANDS.editManualIncome, (ctx, data) =>
  ctx.deps.editManualIncome.execute({ ownerId: ctx.ownerId, ...data }),
);

export const tagMerchant = command(COMMANDS.tagMerchant, (ctx, data) =>
  ctx.deps.tagMerchant.execute({ ownerId: ctx.ownerId, ...data }),
);
