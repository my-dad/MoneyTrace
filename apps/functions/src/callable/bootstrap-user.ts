import { COMMANDS } from "@moneytrace/contracts";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const bootstrapUser = (getDeps: () => Deps) =>
  createCallable(COMMANDS.bootstrapUser, getDeps, (ctx) =>
    ctx.deps.bootstrapUser.execute({ ownerId: ctx.ownerId }),
  );
