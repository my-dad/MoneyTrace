import { COMMANDS } from "@moneytrace/contracts";
import { CallError, command } from "./command";

/**
 * "Delete my account" (CR-009): immediate. The typed confirmation is checked by the contract.
 * Everything is erased and verified before the reply says so; any failure is reported, never hidden.
 */
export const requestAccountDeletion = command(COMMANDS.requestAccountDeletion, async (ctx) => {
  const deletion = ctx.deps.accountDeletion;
  if (deletion === undefined) throw new CallError("failed-precondition", "notSupported");
  return { requestId: await deletion.erase(ctx.ownerId) };
});
