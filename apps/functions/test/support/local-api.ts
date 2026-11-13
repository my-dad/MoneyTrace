import { createApiHandler } from "../../src/api";
import type { Caller } from "../../src/callable/access";
import { composeDeps, type Deps } from "../../src/composition";
import { pgliteStore } from "../../../../packages/infrastructure/test/support/pglite";

/**
 * The whole backend in-process (CR-010): the real `/api` handler, composition and Postgres schema
 * on PGlite. Replies keep the callable shape these suites were written against
 * (`{ result }` / `{ error: { status: "NOT_FOUND", message } }`), so their evidence carries over.
 */
export type User = { uid: string; token: string };
export type Reply = { status: number; result?: Record<string, unknown>; error?: { status: string; message: string } };

export async function localBackend(env: Record<string, string> = { FUNCTIONS_EMULATOR: "true", MONEYTRACE_AI: "fake" }) {
  const { store, client } = await pgliteStore();
  const deletedLogins: string[] = [];
  const deps: Deps = composeDeps(store, env, {
    deleteAuthUser: (uid) => {
      deletedLogins.push(uid);
      return Promise.resolve();
    },
  });
  /** Tokens are `<uid>|<email>|<verified>|<provider>`; anything else proves nobody. */
  const verifyCaller = (token: string): Promise<Caller | undefined> => {
    const [uid, email, verified, provider] = token.split("|");
    if (uid === undefined || uid === "" || email === undefined) return Promise.resolve(undefined);
    return Promise.resolve({ uid, email, emailVerified: verified === "1", provider: provider === "google" ? "google" : "other" });
  };
  const handle = createApiHandler({
    getDeps: () => deps,
    verifyCaller,
    cronSecret: "local-cron-secret-0123456789",
    allowedOrigins: [],
    background: (work) => void work,
    nowMs: () => Date.now(),
  });

  let n = 0;
  const signUp = (label: string, opts: { verified?: boolean; provider?: string } = {}): User => {
    const uid = `${label}-${String(++n)}-${crypto.randomUUID().slice(0, 8)}`;
    return { uid, token: `${uid}|${uid}@example.test|${opts.verified === false ? "0" : "1"}|${opts.provider ?? "google"}` };
  };

  const send = async (body: unknown, headers: Record<string, string>): Promise<Reply> => {
    const res = await handle(new Request("http://local/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
    const json = (await res.json()) as { result?: Record<string, unknown>; error?: { code: string; message: string } };
    return {
      status: res.status,
      ...(json.result === undefined ? {} : { result: json.result }),
      ...(json.error === undefined ? {} : { error: { status: json.error.code.toUpperCase().replaceAll("-", "_"), message: json.error.message } }),
    };
  };

  return {
    db: store,
    client,
    deps,
    deletedLogins,
    signUp,
    call: (name: string, user: User | null, data: unknown) =>
      send({ command: name, data }, user === null ? {} : { authorization: `Bearer ${user.token}` }),
    callRaw: (body: unknown, headers: Record<string, string>) => send(body, headers),
    runJob: (job: string) => send({ job }, { "x-cron-secret": "local-cron-secret-0123456789" }),
    /** Every document of one owner, with its data, so any change at all is visible. */
    async snapshotTree(uid: string): Promise<Record<string, unknown>> {
      const { rows } = await client.query("select path, data from docs where owner_id = $1 order by path", [uid]);
      return Object.fromEntries(rows.map((r) => [r.path, r.data]));
    },
  };
}
