import { HttpsError, onCall, type CallableOptions } from "firebase-functions/v2/https";
import type { z } from "zod";
import type { Deps } from "../composition";
import { callerFromFirebase, type VerifiedToken } from "./access";
import { CallError, command, runCommand, type Command, type Contract, type Handler } from "./command";

export { CALLABLE_RATE_LIMITS, EMULATOR_RATE_LIMITS, type RateLimits, type CallableContext, type Handler } from "./command";

export const REGION = "asia-south2";
/** Matches `PIPELINE_TIMEOUTS.functionExecutionTimeoutMs`. */
export const TIMEOUT_SECONDS = 120;

export type CallableDeps = Deps;

/**
 * Release blockers A3 and A5. App Check is enforced everywhere but the emulator, which is decided
 * when the bundle loads (deploy analysis runs without FUNCTIONS_EMULATOR, so it deploys enforced).
 */
export const CALLABLE_OPTIONS = {
  region: REGION,
  timeoutSeconds: TIMEOUT_SECONDS,
  memory: "256MiB",
  maxInstances: 3,
  minInstances: 0,
  concurrency: 1,
  enforceAppCheck: process.env["FUNCTIONS_EMULATOR"] !== "true",
  secrets: ["ALLOWED_EMAILS"],
} satisfies CallableOptions;

type RequestLike = {
  auth?: { uid: string; token?: VerifiedToken } | undefined;
  rawRequest?: { ip?: string | undefined } | undefined;
  data: unknown;
};

/** Firebase's transport over `runCommand`: the same gate, with refusals as `HttpsError`. */
export async function runCallable<Req extends z.ZodType, Res extends z.ZodType>(
  contract: Contract<Req, Res>,
  handler: Handler<Req, Res>,
  deps: Deps,
  request: RequestLike,
): Promise<z.output<Res>> {
  const auth = request.auth;
  try {
    return await runCommand(command(contract, handler), deps, {
      caller: auth === undefined ? undefined : callerFromFirebase(auth.uid, auth.token),
      ip: request.rawRequest?.ip,
      data: request.data,
    });
  } catch (e) {
    if (e instanceof CallError) throw new HttpsError(e.code, e.message);
    throw e;
  }
}

/** `getDeps` is lazy so importing the module never touches the database. */
export function createCallable<Req extends z.ZodType, Res extends z.ZodType>(cmd: Command<Req, Res>, getDeps: () => Deps) {
  return onCall(CALLABLE_OPTIONS, (request) => runCallable(cmd.contract, cmd.handler, getDeps(), request));
}
