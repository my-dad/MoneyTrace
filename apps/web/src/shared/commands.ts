import { COMMANDS, type CommandName } from "@moneytrace/contracts";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { z } from "zod";

export const PHASE_ONE_COMMANDS = [
  "createAccount",
  "recordOpeningBalance",
  "createPaymentInstrument",
  "updateSettings",
  "submitEvidence",
  "confirmCandidate",
  "resolveFollowUp",
  "snoozeFollowUp",
  "retrySourceEvent",
  "cancelSourceEvent",
  "answerQuestion",
  "correctTransaction",
  "recordCustodyTransfer",
  "recordReconciliation",
  "recordAdjustment",
  "splitTransfer",
] as const satisfies readonly CommandName[];

type PhaseOneCommand = (typeof PHASE_ONE_COMMANDS)[number];
export type CommandRequest<Name extends PhaseOneCommand> = z.input<(typeof COMMANDS)[Name]["request"]>;
export type CommandResponse<Name extends PhaseOneCommand> = z.output<(typeof COMMANDS)[Name]["response"]>;

export type Commands = {
  [Name in PhaseOneCommand]: (request: CommandRequest<Name>) => Promise<CommandResponse<Name>>;
};

export function createFirebaseCommands(): Commands {
  return Object.fromEntries(
    PHASE_ONE_COMMANDS.map((name) => [
      name,
      async (request: unknown) => {
        const parsedRequest = COMMANDS[name].request.parse(request);
        const result = await httpsCallable(functions, name)(parsedRequest);
        return COMMANDS[name].response.parse(result.data);
      },
    ]),
  ) as Commands;
}
