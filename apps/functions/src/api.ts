import { asSourceEventId, type OwnerId } from "@moneytrace/domain";
import type { Caller } from "./callable/access";
import { CallError, runCommand, type Command, type WireCode } from "./callable/command";
import { COMMAND_HANDLERS, type CommandName } from "./callable/registry";
import type { Deps } from "./composition";
import { JOBS, drivePipeline } from "./jobs";

/**
 * The Supabase backend's one endpoint (CR-010), on web-standard Request/Response so it runs in an
 * Edge Function (Deno) and in Node tests alike. `POST {command, data}` with the user's bearer token
 * runs a command through the same gate as Firebase; `POST {job}` with `x-cron-secret` runs a
 * scheduled job.
 */
export type ApiConfig = {
  getDeps: () => Deps;
  /** Resolves a bearer token to the signed-in caller, or undefined if it proves nobody. */
  verifyCaller: (token: string) => Promise<Caller | undefined>;
  cronSecret: string | undefined;
  allowedOrigins: readonly string[];
  /** Keeps work running after the response (Edge Runtime `waitUntil`). */
  background: (work: Promise<unknown>) => void;
  nowMs: () => number;
};

const HTTP_STATUS: Record<WireCode, number> = {
  "invalid-argument": 400,
  "failed-precondition": 400,
  unauthenticated: 401,
  "permission-denied": 403,
  "not-found": 404,
  "already-exists": 409,
  "resource-exhausted": 429,
  internal: 500,
};

const MAX_BODY_CHARS = 64_000;
/** Commands after which a source event may have a stage to run, as Firebase's trigger would see. */
const DRIVES_PIPELINE: ReadonlySet<CommandName> = new Set(["submitEvidence", "retrySourceEvent", "confirmCandidate", "answerQuestion"]);

const own = <T extends object>(o: T, key: string): key is Extract<keyof T, string> => Object.prototype.hasOwnProperty.call(o, key);

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createApiHandler(cfg: ApiConfig): (req: Request) => Promise<Response> {
  return async (req) => {
    const origin = req.headers.get("origin");
    const cors: Record<string, string> =
      origin !== null && cfg.allowedOrigins.includes(origin)
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-max-age": "600",
            vary: "origin",
          }
        : {};
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    const refuse = (code: WireCode, message: string) => json(HTTP_STATUS[code], { error: { code, message } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return refuse("not-found", "not-found");

    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return refuse("invalid-argument", "invalid request");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return refuse("invalid-argument", "invalid request");
    }
    if (typeof body !== "object" || body === null) return refuse("invalid-argument", "invalid request");
    const { command, job, data } = body as { command?: unknown; job?: unknown; data?: unknown };

    if (job !== undefined) {
      const secret = req.headers.get("x-cron-secret");
      if (cfg.cronSecret === undefined || cfg.cronSecret === "" || secret === null || !sameSecret(secret, cfg.cronSecret)) {
        return refuse("permission-denied", "permission-denied");
      }
      if (typeof job !== "string" || !own(JOBS, job)) return refuse("not-found", "not-found");
      await JOBS[job](cfg.getDeps(), cfg.nowMs());
      return json(200, { result: { job } });
    }

    if (typeof command !== "string" || !own(COMMAND_HANDLERS, command)) return refuse("not-found", "not-found");
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") === true ? auth.slice("Bearer ".length).trim() : "";
    const caller = token === "" ? undefined : await cfg.verifyCaller(token);
    const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0])?.trim();
    const deps = cfg.getDeps();
    try {
      const result: unknown = await runCommand(COMMAND_HANDLERS[command] as unknown as Command, deps, { caller, ip, data });
      if (caller !== undefined && DRIVES_PIPELINE.has(command)) {
        const id = (result as { sourceEventId?: unknown }).sourceEventId ?? (data as { sourceEventId?: unknown }).sourceEventId;
        if (typeof id === "string") {
          const ownerId = caller.uid as OwnerId;
          cfg.background(
            drivePipeline(deps, ownerId, asSourceEventId(id)).catch((e: unknown) => {
              // The sweep and recovery jobs pick the event up; nothing is lost.
              deps.logger.warn("pipeline.driveFailed", { errorName: e instanceof Error ? e.name : "unknown" });
            }),
          );
        }
      }
      return json(200, { result });
    } catch (e) {
      if (e instanceof CallError) return refuse(e.code, e.message);
      return refuse("internal", "internal");
    }
  };
}

type SupabaseUser = {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  app_metadata?: { provider?: unknown } | null;
};

/** Asks Supabase Auth who the token belongs to: the authoritative check, revocation included. */
export function supabaseCallerVerifier(
  supabaseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch,
): (token: string) => Promise<Caller | undefined> {
  return async (token) => {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!res.ok) return undefined;
    const u = (await res.json()) as SupabaseUser;
    if (typeof u.id !== "string" || u.id === "") return undefined;
    return {
      uid: u.id,
      email: typeof u.email === "string" ? u.email : undefined,
      emailVerified: typeof u.email_confirmed_at === "string" && u.email_confirmed_at !== "",
      provider: u.app_metadata?.provider === "google" ? "google" : "other",
    };
  };
}
