import { COMMANDS } from "@moneytrace/contracts";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const createAccount = (getDeps: () => Deps) =>
  createCallable(COMMANDS.createAccount, getDeps, (ctx, data) =>
    ctx.deps.createAccount.execute({
      ownerId: ctx.ownerId,
      kind: data.kind,
      name: data.name,
      currency: data.currency,
    }),
  );
