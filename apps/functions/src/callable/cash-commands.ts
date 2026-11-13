import { COMMANDS } from "@moneytrace/contracts";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

/** A cash count (gate 32): stored and compared, never a balance change. */
export const recordReconciliation = (getDeps: () => Deps) =>
  createCallable(COMMANDS.recordReconciliation, getDeps, (ctx, data) =>
    ctx.deps.recordCashCount.execute({ ownerId: ctx.ownerId, ...data }),
  );

/** Adjusts Cash to an open count, with the user's reason. */
export const recordAdjustment = (getDeps: () => Deps) =>
  createCallable(COMMANDS.recordAdjustment, getDeps, (ctx, data) =>
    ctx.deps.recordCashAdjustment.execute({ ownerId: ctx.ownerId, ...data }),
  );

/** "Not a transfer": counts a wrongly paired transfer's two SMS separately again. */
export const splitTransfer = (getDeps: () => Deps) =>
  createCallable(COMMANDS.splitTransfer, getDeps, (ctx, data) =>
    ctx.deps.splitTransfer.execute({ ownerId: ctx.ownerId, ...data }),
  );
