import { COMMANDS } from "@moneytrace/contracts";
import { command } from "./command";

export const bootstrapUser = command(COMMANDS.bootstrapUser, (ctx) =>
    ctx.deps.bootstrapUser.execute({ ownerId: ctx.ownerId }),
  );
