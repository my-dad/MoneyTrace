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

/** The user's name and picture. */
export const updateProfile = command(COMMANDS.updateProfile, (ctx, data) =>
  ctx.deps.updateProfile.execute({ ownerId: ctx.ownerId, ...data }),
);

/** Notes this visit and returns the previous one. */
export const recordVisit = command(COMMANDS.recordVisit, (ctx) => ctx.deps.recordVisit.execute({ ownerId: ctx.ownerId }));

export const tagMerchant = command(COMMANDS.tagMerchant, (ctx, data) =>
  ctx.deps.tagMerchant.execute({ ownerId: ctx.ownerId, ...data }),
);
