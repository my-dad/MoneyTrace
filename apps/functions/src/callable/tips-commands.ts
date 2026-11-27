import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

/** Saves this month's tip figures and asks DeepSeek for advice when it is due. */
export const refreshTips = command(COMMANDS.refreshTips, (ctx, data) =>
  ctx.deps.refreshTips.execute({ ownerId: ctx.ownerId, force: data.force }),
);
