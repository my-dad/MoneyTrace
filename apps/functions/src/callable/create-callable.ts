import { createHash } from "node:crypto";
import type { RateBucket } from "@moneytrace/application";
import { asOwnerId, DomainError, type DomainErrorCode, type OwnerId } from "@moneytrace/domain";
import { HttpsError, onCall, type CallableOptions } from "firebase-functions/v2/https";
import type { z } from "zod";
import type { Deps } from "../composition";
import { isAllowed, type VerifiedToken } from "./access";

export const REGION = "asia-south2";
/** Matches `PIPELINE_TIMEOUTS.functionExecutionTimeoutMs`. */
export const TIMEOUT_SECONDS = 120;

export type CallableDeps = Deps;

/** One person's use, with room for a burst of pastes; anything faster is abuse (release blocker A4). */
export const CALLABLE_RATE_LIMITS: RateLimits = { userPerMinute: 30, userPerDay: 1000, ipPerMinute: 60 };

/** Emulator suites call from one address far faster than a person; unit tests cover the real limits. */
export const EMULATOR_RATE_LIMITS: RateLimits = { userPerMinute: 10_000, userPerDay: 100_000, ipPerMinute: 10_000 };

export type RateLimits = { userPerMinute: number; userPerDay: number; ipPerMinute: number };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

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

const WIRE_STATUS: Partial<Record<DomainErrorCode, "not-found" | "already-exists">> = {
  accountInvalid: "not-found",
  resourceNotFound: "not-found",
  idempotencyConflict: "already-exists",
};

export type CallableContext = { ownerId: OwnerId; correlationId: string; deps: Deps };

type Contract<Req extends z.ZodType, Res extends z.ZodType> = { request: Req; response: Res };

export type Handler<Req extends z.ZodType, Res extends z.ZodType> = (
  ctx: CallableContext,
  data: z.output<Req>,
) => Promise<z.input<Res>>;

type RequestLike = {
  auth?: { uid: string; token?: VerifiedToken } | undefined;
  rawRequest?: { ip?: string | undefined } | undefined;
  data: unknown;
};

const ipKey = (ip: string | undefined): string =>
  `ip-${createHash("sha256").update(ip ?? "unknown").digest("hex").slice(0, 32)}`;

function bucketsFor(uid: string, ip: string | undefined, limits: RateLimits): RateBucket[] {
  return [
    { key: `user-${uid}-m`, limit: limits.userPerMinute, windowMs: MINUTE_MS },
    { key: `user-${uid}-d`, limit: limits.userPerDay, windowMs: DAY_MS },
    { key: ipKey(ip), limit: limits.ipPerMinute, windowMs: MINUTE_MS },
  ];
}

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

  const { callGate } = deps;
  if (!isAllowed(callGate.access, request.auth?.token ?? {})) {
    deps.logger.warn("callable.rejected", { correlationId, errorCode: "notAllowed" });
    throw new HttpsError("permission-denied", "permission-denied");
  }
  if ((await callGate.limiter.take(bucketsFor(uid, request.rawRequest?.ip, callGate.limits), callGate.nowMs())) === "limited") {
    deps.logger.warn("callable.rejected", { correlationId, errorCode: "rateLimited" });
    throw new HttpsError("resource-exhausted", "rateLimited");
  }

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
      throw new HttpsError(WIRE_STATUS[e.code] ?? "failed-precondition", e.code);
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
  return onCall(CALLABLE_OPTIONS, (request) =>
    runCallable(contract, handler, getDeps(), request),
  );
}
