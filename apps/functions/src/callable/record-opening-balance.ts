import { COMMANDS } from "@moneytrace/contracts";
import { asAccountId, Money } from "@moneytrace/domain";
import { HttpsError } from "firebase-functions/v2/https";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const recordOpeningBalance = (getDeps: () => Deps) =>
  createCallable(COMMANDS.recordOpeningBalance, getDeps, async (ctx, data) => {
    const result = await ctx.deps.recordOpeningBalance.execute({
      ownerId: ctx.ownerId,
      accountId: asAccountId(data.accountId),
      amount: Money.ofMinor(data.amountMinor, data.currency),
      effectiveAtMs: data.effectiveAtMs,
      actor: ctx.ownerId,
    });
    if (result.status === "idempotencyConflict") {
      throw new HttpsError("already-exists", "idempotencyConflict");
    }
    return {
      transactionId: result.transactionId,
      status: result.status === "committed" ? ("recorded" as const) : ("alreadyRecorded" as const),
    };
  });
