import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

/** Sets up a new user. The OWNER_EMAIL account also gets the owner's AI plan (CR-009). */
export const bootstrapUser = command(COMMANDS.bootstrapUser, async (ctx) => {
  const result = await ctx.deps.bootstrapUser.execute({ ownerId: ctx.ownerId });
  const { ownerEmail } = ctx.deps;
  if (ownerEmail !== undefined && ctx.email?.trim().toLowerCase() === ownerEmail) {
    await ctx.deps.aiPlans.markOwner(ctx.ownerId);
  }
  return result;
});
