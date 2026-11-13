import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

export const createPaymentInstrument = command(COMMANDS.createPaymentInstrument, (ctx, data) =>
    ctx.deps.createPaymentInstrument.execute({
      ownerId: ctx.ownerId,
      accountId: data.accountId,
      provider: data.provider,
      maskedIdentifier: data.maskedIdentifier,
      type: data.type,
    }),
  );
