import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

export const createAccount = command(COMMANDS.createAccount, (ctx, data) =>
    ctx.deps.createAccount.execute({
      ownerId: ctx.ownerId,
      kind: data.kind,
      name: data.name,
      currency: data.currency,
    }),
  );
