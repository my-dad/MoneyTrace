import { createHash } from "node:crypto";
import type { RateBucket } from "@moneytrace/application";
import { asOwnerId, DomainError, type DomainErrorCode, type OwnerId } from "@moneytrace/domain";
import type { z } from "zod";
import type { Deps } from "../composition";
import { isAllowed, type Caller } from "./access";

/**
 * The call gate and the command handlers, free of any transport (CR-010): Firebase `onCall` and the
 * Supabase `/api` function both run commands through `runCommand`, so they gate, validate and map
 * errors identically. Wire codes are the callable ones (docs/architecture/function-contracts.md).
 */
export type WireCode =
  | "unauthenticated"
  | "permission-denied"
  | "resource-exhausted"
  | "invalid-argument"
  | "not-found"
  | "already-exists"
  | "failed-precondition"
  | "internal";

/** A refusal with its wire code. The message is a code at most, never caller- or document-supplied. */
export class CallError extends Error {
  readonly code: WireCode;
  constructor(code: WireCode, message: string) {
    super(message);
    this.name = "CallError";
    this.code = code;
  }
}

/** One person's use, with room for a burst of pastes; anything faster is abuse (release blocker A4). */
export const CALLABLE_RATE_LIMITS: RateLimits = { userPerMinute: 30, userPerDay: 1000, ipPerMinute: 60 };

/** Emulator suites call from one address far faster than a person; unit tests cover the real limits. */
export const EMULATOR_RATE_LIMITS: RateLimits = { userPerMinute: 10_000, userPerDay: 100_000, ipPerMinute: 10_000 };

export type RateLimits = { userPerMinute: number; userPerDay: number; ipPerMinute: number };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const WIRE_STATUS: Partial<Record<DomainErrorCode, "not-found" | "already-exists">> = {
  accountInvalid: "not-found",
  resourceNotFound: "not-found",
  idempotencyConflict: "already-exists",
};

export type CallableContext = { ownerId: OwnerId; correlationId: string; deps: Deps };

export type Contract<Req extends z.ZodType, Res extends z.ZodType> = { request: Req; response: Res };

export type Handler<Req extends z.ZodType, Res extends z.ZodType> = (
  ctx: CallableContext,
  data: z.output<Req>,
) => Promise<z.input<Res>>;

export type Command<Req extends z.ZodType = z.ZodType, Res extends z.ZodType = z.ZodType> = {
  contract: Contract<Req, Res>;
  handler: Handler<Req, Res>;
};

export const command = <Req extends z.ZodType, Res extends z.ZodType>(
  contract: Contract<Req, Res>,
  handler: Handler<Req, Res>,
): Command<Req, Res> => ({ contract, handler });

/** What a transport proved about the caller. `caller` is undefined when nobody signed in. */
export type CommandRequest = { caller: Caller | undefined; ip: string | undefined; data: unknown };

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
 * The owner comes from the verified caller only; the body is a strict schema, so it can never
 * carry one. Throws `CallError` for every refusal.
 */
export async function runCommand<Req extends z.ZodType, Res extends z.ZodType>(
  cmd: Command<Req, Res>,
  deps: Deps,
  request: CommandRequest,
): Promise<z.output<Res>> {
  const correlationId = deps.ids.newId();
  const caller = request.caller;
  // A sign-in that names no user is nobody (the Firebase emulator accepts junk tokens without one).
  if (caller === undefined || typeof caller.uid !== "string" || caller.uid === "") {
    throw new CallError("unauthenticated", "unauthenticated");
  }

  const { callGate } = deps;
  if (!isAllowed(callGate.access, caller)) {
    deps.logger.warn("callable.rejected", { correlationId, errorCode: "notAllowed" });
    throw new CallError("permission-denied", "permission-denied");
  }
  if ((await callGate.limiter.take(bucketsFor(caller.uid, request.ip, callGate.limits), callGate.nowMs())) === "limited") {
    deps.logger.warn("callable.rejected", { correlationId, errorCode: "rateLimited" });
    throw new CallError("resource-exhausted", "rateLimited");
  }

  const parsed = cmd.contract.request.safeParse(request.data);
  if (!parsed.success) {
    deps.logger.info("callable.rejected", { correlationId, errorCode: "invalidArgument" });
    throw new CallError("invalid-argument", "invalid request");
  }

  try {
    const result = await cmd.handler({ ownerId: asOwnerId(caller.uid), correlationId, deps }, parsed.data);
    return cmd.contract.response.parse(result);
  } catch (e) {
    if (e instanceof CallError) {
      deps.logger.info("callable.rejected", { correlationId, errorCode: e.code });
      throw e;
    }
    if (e instanceof DomainError) {
      deps.logger.info("callable.rejected", { correlationId, errorCode: e.code });
      throw new CallError(WIRE_STATUS[e.code] ?? "failed-precondition", e.code);
    }
    deps.logger.error("callable.failed", {
      correlationId,
      errorName: e instanceof Error ? e.name : "unknown",
    });
    throw new CallError("internal", "internal");
  }
}
