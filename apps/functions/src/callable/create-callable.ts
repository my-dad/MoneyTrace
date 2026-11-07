import { asOwnerId, DomainError, type OwnerId } from "@moneytrace/domain";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { z } from "zod";
import type { Deps } from "../composition";

export const REGION = "asia-south2";
/** Matches `PIPELINE_TIMEOUTS.functionExecutionTimeoutMs`. */
export const TIMEOUT_SECONDS = 120;

export type CallableDeps = Deps;

export type CallableContext = { ownerId: OwnerId; correlationId: string; deps: Deps };

type Contract<Req extends z.ZodType, Res extends z.ZodType> = { request: Req; response: Res };

export type Handler<Req extends z.ZodType, Res extends z.ZodType> = (
  ctx: CallableContext,
  data: z.output<Req>,
) => Promise<z.input<Res>>;

type RequestLike = { auth?: { uid: string } | undefined; data: unknown };

/**
 * Wire mapping (docs/architecture/function-contracts.md). The owner comes from the verified
 * token only; the body is a strict schema, so it can never carry one. Error messages carry a
 * domain code at most, and never anything the caller or a document supplied.
 */
export async function runCallable<Req extends z.ZodType, Res extends z.ZodType>(
  contract: Contract<Req, Res>,
  handler: Handler<Req, Res>,
  deps: Deps,
  request: RequestLike,
): Promise<z.output<Res>> {
  const correlationId = deps.ids.newId();
  const uid = request.auth?.uid;
  if (uid === undefined) throw new HttpsError("unauthenticated", "unauthenticated");

  const parsed = contract.request.safeParse(request.data);
  if (!parsed.success) {
    deps.logger.info("callable.rejected", { correlationId, errorCode: "invalidArgument" });
    throw new HttpsError("invalid-argument", "invalid request");
  }

  try {
    const ownerId = asOwnerId(uid);
    const result = await handler({ ownerId, correlationId, deps }, parsed.data);
    return contract.response.parse(result);
  } catch (e) {
    if (e instanceof HttpsError) {
      deps.logger.info("callable.rejected", { correlationId, errorCode: e.code });
      throw e;
    }
    if (e instanceof DomainError) {
      deps.logger.info("callable.rejected", { correlationId, errorCode: e.code });
      throw new HttpsError(
        e.code === "accountInvalid" ? "not-found" : "failed-precondition",
        e.code,
      );
    }
    deps.logger.error("callable.failed", {
      correlationId,
      errorName: e instanceof Error ? e.name : "unknown",
    });
    throw new HttpsError("internal", "internal");
  }
}

/** `getDeps` is lazy so importing the module never touches Firestore. */
export function createCallable<Req extends z.ZodType, Res extends z.ZodType>(
  contract: Contract<Req, Res>,
  getDeps: () => Deps,
  handler: Handler<Req, Res>,
) {
  return onCall({ region: REGION, timeoutSeconds: TIMEOUT_SECONDS }, (request) =>
    runCallable(contract, handler, getDeps(), request),
  );
}
