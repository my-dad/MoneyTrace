import { COMMANDS } from "@moneytrace/contracts";
import { asAccountId, Money } from "@moneytrace/domain";
import { CallError, command } from "./command";

export const recordOpeningBalance = command(COMMANDS.recordOpeningBalance, async (ctx, data) => {
    const result = await ctx.deps.recordOpeningBalance.execute({
      ownerId: ctx.ownerId,
      accountId: asAccountId(data.accountId),
      amount: Money.ofMinor(data.amountMinor, data.currency),
      effectiveAtMs: data.effectiveAtMs,
      actor: ctx.ownerId,
    });
    if (result.status === "idempotencyConflict") {
      throw new CallError("already-exists", "idempotencyConflict");
    }
    return {
      transactionId: result.transactionId,
      status: result.status === "committed" ? ("recorded" as const) : ("alreadyRecorded" as const),
    };
  });
