import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadModelGateway } from "./read-model-gateway";

/** One read of an owner collection. The gateway re-applies every filter, so the server's are an optimisation. */
export type DocsQuery = {
  collection: string;
  equals?: { field: string; value: string };
  within?: { field: string; values: readonly string[] };
  range?: { field: string; fromMs: number; toMs: number };
  order?: { field: string; desc: boolean };
  limit?: number;
};

/** Where documents come from (CR-010): Supabase in the app, an in-memory list in tests. */
export type DocsSource = {
  uid(): string | null;
  list(uid: string, query: DocsQuery): Promise<unknown[]>;
  /** Calls back whenever any of the user's documents changes; returns the unsubscribe. */
  onChange(uid: string, callback: () => void): () => void;
};

const POLL_MS = 30_000;
const SETTLE_MS = 250;

const field = (doc: unknown, name: string): unknown => (doc as Record<string, unknown>)[name];

/** The query's meaning, applied to the rows whatever the server did. */
export function applyQuery(docs: readonly unknown[], q: DocsQuery): unknown[] {
  let rows = docs.filter((d) => {
    if (q.equals !== undefined && field(d, q.equals.field) !== q.equals.value) return false;
    if (q.within !== undefined && !q.within.values.includes(field(d, q.within.field) as string)) return false;
    if (q.range !== undefined) {
      const v = field(d, q.range.field);
      if (typeof v !== "number" || v < q.range.fromMs || v > q.range.toMs) return false;
    }
    return true;
  });
  if (q.order !== undefined) {
    const { field: f, desc } = q.order;
    rows = [...rows].sort((a, b) => ((field(a, f) as number) - (field(b, f) as number)) * (desc ? -1 : 1));
  }
  return q.limit === undefined ? rows : rows.slice(0, q.limit);
}

export function createDocsReadModelGateway(source: DocsSource, timers: Pick<typeof globalThis, "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval"> = globalThis): ReadModelGateway {
  function watch<T>(q: DocsQuery, parse: (v: unknown) => T, onValue: (rows: T[]) => void, onError?: (e: Error) => void): () => void {
    const uid = source.uid();
    if (uid === null) {
      onError?.(new Error("a signed-in user is required"));
      return () => undefined;
    }
    let stopped = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const rows = applyQuery(await source.list(uid, q), q).map(parse);
        if (!stopped) onValue(rows);
      } catch (e) {
        if (!stopped) onError?.(e instanceof Error ? e : new Error("read failed"));
      }
    };
    void load();
    const off = source.onChange(uid, () => {
      if (settle !== undefined) timers.clearTimeout(settle);
      settle = timers.setTimeout(() => void load(), SETTLE_MS);
    });
    const poll = timers.setInterval(() => void load(), POLL_MS);
    return () => {
      stopped = true;
      off();
      timers.clearInterval(poll);
      if (settle !== undefined) timers.clearTimeout(settle);
    };
  }

  const entries = (q: Omit<DocsQuery, "collection">) => ({ collection: "ledgerEntries", order: { field: "occurredAtMs", desc: false }, ...q });
  return {
    watchAccounts: (onValue, onError) => watch({ collection: "accounts" }, (v) => OWNER_COLLECTIONS.accounts.parse(v), onValue, onError),
    watchBalances: (onValue, onError) => watch({ collection: "balances" }, (v) => OWNER_COLLECTIONS.balances.parse(v), onValue, onError),
    watchFollowUps: (onValue, onError) => watch({ collection: "followUps" }, (v) => OWNER_COLLECTIONS.followUps.parse(v), onValue, onError),
    watchSourceEvents: (limit, onValue, onError) =>
      watch({ collection: "sourceEvents", order: { field: "receivedAtMs", desc: true }, limit }, (v) => OWNER_COLLECTIONS.sourceEvents.parse(v), onValue, onError),
    watchExpenseEntries: (fromMs, toMs, onValue, onError) =>
      watch(entries({ equals: { field: "accountKind", value: "expense" }, range: { field: "occurredAtMs", fromMs, toMs } }), (v) => OWNER_COLLECTIONS.ledgerEntries.parse(v), onValue, onError),
    watchIncomeEntries: (fromMs, toMs, onValue, onError) =>
      watch(entries({ equals: { field: "accountKind", value: "income" }, range: { field: "occurredAtMs", fromMs, toMs } }), (v) => OWNER_COLLECTIONS.ledgerEntries.parse(v), onValue, onError),
    watchSourceEntries: (fromMs, toMs, onValue, onError) =>
      watch(
        entries({ within: { field: "accountKind", values: ["bank", "cash", "familyCash", "creditLiability"] }, range: { field: "occurredAtMs", fromMs, toMs } }),
        (v) => OWNER_COLLECTIONS.ledgerEntries.parse(v),
        onValue,
        onError,
      ),
    watchAiUsage: (fromMs, toMs, onValue, onError) =>
      watch(
        { collection: "aiUsage", range: { field: "createdAtMs", fromMs, toMs }, order: { field: "createdAtMs", desc: false } },
        (v) => OWNER_COLLECTIONS.aiUsage.parse(v),
        onValue,
        onError,
      ),
  };
}

/** Reads `docs` through row-level security; one Realtime channel per user feeds every watcher. */
export function createSupabaseDocsSource(client: SupabaseClient, uid: () => string | null): DocsSource {
  const listeners = new Map<string, Set<() => void>>();
  const channels = new Map<string, ReturnType<SupabaseClient["channel"]>>();
  return {
    uid,
    async list(owner, q) {
      let b = client.from("docs").select("data").eq("parent", `users/${owner}/${q.collection}`);
      if (q.equals !== undefined) b = b.eq(`data->>${q.equals.field}`, q.equals.value);
      if (q.within !== undefined) b = b.in(`data->>${q.within.field}`, [...q.within.values]);
      if (q.range !== undefined) b = b.gte(`data->${q.range.field}`, q.range.fromMs).lte(`data->${q.range.field}`, q.range.toMs);
      if (q.order !== undefined) b = b.order(`data->${q.order.field}`, { ascending: !q.order.desc });
      if (q.limit !== undefined) b = b.limit(q.limit);
      const { data, error } = await b;
      if (error !== null) throw new Error(error.message);
      return (data as { data: unknown }[]).map((r) => r.data);
    },
    onChange(owner, callback) {
      let set = listeners.get(owner);
      if (set === undefined) {
        const fresh = new Set<() => void>();
        set = fresh;
        listeners.set(owner, fresh);
        const channel = client
          .channel(`docs-${owner}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: `owner_id=eq.${owner}` }, () => {
            fresh.forEach((cb) => {
              cb();
            });
          })
          .subscribe();
        channels.set(owner, channel);
      }
      set.add(callback);
      return () => {
        set.delete(callback);
        if (set.size === 0) {
          listeners.delete(owner);
          const channel = channels.get(owner);
          channels.delete(owner);
          if (channel !== undefined) void client.removeChannel(channel);
        }
      };
    },
  };
}
