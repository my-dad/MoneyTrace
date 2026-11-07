import { COMMANDS } from "@moneytrace/contracts";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const createPaymentInstrument = (getDeps: () => Deps) =>
  createCallable(COMMANDS.createPaymentInstrument, getDeps, (ctx, data) =>
    ctx.deps.createPaymentInstrument.execute({
      ownerId: ctx.ownerId,
      accountId: data.accountId,
      provider: data.provider,
      maskedIdentifier: data.maskedIdentifier,
      type: data.type,
    }),
  );
