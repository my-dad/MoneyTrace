import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

/** A cash count (gate 32): stored and compared, never a balance change. */
export const recordReconciliation = command(COMMANDS.recordReconciliation, (ctx, data) =>
    ctx.deps.recordCashCount.execute({ ownerId: ctx.ownerId, ...data }),
  );

/** Adjusts Cash to an open count, with the user's reason. */
export const recordAdjustment = command(COMMANDS.recordAdjustment, (ctx, data) =>
    ctx.deps.recordCashAdjustment.execute({ ownerId: ctx.ownerId, ...data }),
  );

/** "Not a transfer": counts a wrongly paired transfer's two SMS separately again. */
export const splitTransfer = command(COMMANDS.splitTransfer, (ctx, data) =>
    ctx.deps.splitTransfer.execute({ ownerId: ctx.ownerId, ...data }),
  );
