import {
  ABORTED,
  ALREADY_EXISTS,
  DocStoreError,
  type CollectionRef,
  type DocData,
  type DocRef,
  type DocSnapshot,
  type DocStore,
  type DocTransaction,
  type Query,
  type QueryDocSnapshot,
  type QuerySnapshot,
  type WhereOp,
} from "./doc-store";
import {
  RETRYABLE_SQLSTATES,
  UNIQUE_VIOLATION,
  sqlState,
  type SqlClient,
  type SqlRunner,
} from "./sql-client";

const SEGMENT = /^[^/]+$/;
const FIELD = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;
const OPS: ReadonlySet<string> = new Set(["==", "<", "<=", ">", ">="]);
const DEFAULT_ATTEMPTS = 5;

function segments(path: string, kind: "document" | "collection"): string[] {
  const segs = path.split("/");
  const even = segs.length % 2 === 0;
  if (segs.some((s) => !SEGMENT.test(s)) || even !== (kind === "document")) {
    throw new Error(`invalid ${kind} path: ${path}`);
  }
  return segs;
}

/** A dotted field path as a Postgres `#>` path literal. Fields come from code, never from users. */
function fieldPath(field: string): string {
  if (!FIELD.test(field)) throw new Error(`invalid field path: ${field}`);
  return `'{${field.split(".").join(",")}}'`;
}

function readField(data: DocData | undefined, field: string): unknown {
  let value: unknown = data;
  for (const key of field.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Drivers return jsonb parsed. Anything else is a storage bug and must fail loudly. */
const parseData = (raw: unknown): DocData => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("stored document is not a JSON object");
  return raw as DocData;
};

class Snapshot implements DocSnapshot {
  readonly ref: DocRef;
  private readonly raw: DocData | undefined;
  constructor(ref: DocRef, raw: DocData | undefined) {
    this.ref = ref;
    this.raw = raw;
  }
  get exists(): boolean {
    return this.raw !== undefined;
  }
  get id(): string {
    return this.ref.id;
  }
  /** A fresh copy each call, as Firestore gives. */
  data(): DocData | undefined {
    return this.raw === undefined ? undefined : (JSON.parse(JSON.stringify(this.raw)) as DocData);
  }
  get(field: string): unknown {
    return readField(this.data(), field);
  }
}

class Snapshots implements QuerySnapshot {
  readonly docs: QueryDocSnapshot[];
  constructor(docs: QueryDocSnapshot[]) {
    this.docs = docs;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(fn: (doc: QueryDocSnapshot) => void): void {
    this.docs.forEach(fn);
  }
}

type Source = { kind: "parent"; path: string } | { kind: "group"; id: string };
type Filter = { field: string; op: WhereOp; value: unknown };
type Order = { field: string; direction: "asc" | "desc" };

class PgQuery implements Query {
  protected readonly store: PgDocStore;
  private readonly source: Source;
  private readonly filters: readonly Filter[];
  private readonly orders: readonly Order[];
  private readonly max: number | null;

  constructor(
    store: PgDocStore,
    source: Source,
    filters: readonly Filter[] = [],
    orders: readonly Order[] = [],
    max: number | null = null,
  ) {
    this.store = store;
    this.source = source;
    this.filters = filters;
    this.orders = orders;
    this.max = max;
  }

  where(field: string, op: WhereOp, value: unknown): Query {
    if (!OPS.has(op)) throw new Error(`unsupported operator: ${op}`);
    fieldPath(field);
    return new PgQuery(
      this.store,
      this.source,
      [...this.filters, { field, op, value }],
      this.orders,
      this.max,
    );
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    fieldPath(field);
    return new PgQuery(
      this.store,
      this.source,
      this.filters,
      [...this.orders, { field, direction }],
      this.max,
    );
  }

  limit(n: number): Query {
    if (!Number.isInteger(n) || n < 0) throw new Error("limit must be a non-negative integer");
    return new PgQuery(this.store, this.source, this.filters, this.orders, n);
  }

  get(): Promise<QuerySnapshot> {
    return this.run(this.store.client);
  }

  /** Firestore semantics: a filter matches only the same JSON type; an ordered field must exist. */
  async run(runner: SqlRunner): Promise<QuerySnapshot> {
    const params: unknown[] = [this.source.kind === "parent" ? this.source.path : this.source.id];
    const where = [this.source.kind === "parent" ? "parent = $1" : "collection_id = $1"];
    for (const f of this.filters) {
      params.push(JSON.stringify(f.value));
      // Sent as text and cast here: a driver that sees a jsonb parameter JSON-encodes it again.
      const p = `$${String(params.length)}::text::jsonb`;
      const col = `data #> ${fieldPath(f.field)}`;
      const op = f.op === "==" ? "=" : f.op;
      where.push(`(jsonb_typeof(${col}) = jsonb_typeof(${p}) and ${col} ${op} ${p})`);
    }
    for (const o of this.orders) where.push(`data #> ${fieldPath(o.field)} is not null`);
    const last = this.orders.at(-1)?.direction ?? "asc";
    const orderBy = [
      ...this.orders.map((o) => `data #> ${fieldPath(o.field)} ${o.direction}`),
      `path ${last}`,
    ];
    const limit = this.max === null ? "" : ` limit ${String(this.max)}`;
    const { rows } = await runner.query(
      `select path, data from docs where ${where.join(" and ")} order by ${orderBy.join(", ")}${limit}`,
      params,
    );
    return new Snapshots(
      rows.map((r) => new Snapshot(this.store.doc(r.path), parseData(r.data)) as QueryDocSnapshot),
    );
  }
}

class PgCollection extends PgQuery implements CollectionRef {
  readonly path: string;
  readonly id: string;
  readonly parent: DocRef | null;

  constructor(store: PgDocStore, path: string) {
    super(store, { kind: "parent", path });
    const segs = segments(path, "collection");
    this.path = path;
    this.id = segs.at(-1) as string;
    this.parent = segs.length === 1 ? null : store.doc(segs.slice(0, -1).join("/"));
  }

  doc(id: string): DocRef {
    return this.store.doc(`${this.path}/${id}`);
  }
}

class PgDoc implements DocRef {
  readonly path: string;
  readonly id: string;
  private readonly store: PgDocStore;

  constructor(store: PgDocStore, path: string) {
    this.id = segments(path, "document").at(-1) as string;
    this.path = path;
    this.store = store;
  }

  get parent(): CollectionRef {
    return this.store.collection(this.path.slice(0, this.path.lastIndexOf("/")));
  }

  collection(id: string): CollectionRef {
    return this.store.collection(`${this.path}/${id}`);
  }

  async get(): Promise<DocSnapshot> {
    return (await this.store.read(this.store.client, [this]))[0] as DocSnapshot;
  }

  set(data: DocData): Promise<unknown> {
    return this.store.write(this.store.client, { kind: "set", ref: this, data });
  }

  create(data: DocData): Promise<unknown> {
    return this.store.write(this.store.client, { kind: "create", ref: this, data });
  }

  delete(): Promise<unknown> {
    return this.store.write(this.store.client, { kind: "delete", ref: this });
  }
}

type Write =
  { kind: "set" | "create"; ref: DocRef; data: DocData } | { kind: "delete"; ref: DocRef };

class PgTransaction implements DocTransaction {
  private readonly store: PgDocStore;
  private readonly runner: SqlRunner;
  readonly writes: Write[] = [];

  constructor(store: PgDocStore, runner: SqlRunner) {
    this.store = store;
    this.runner = runner;
  }

  get(ref: DocRef): Promise<DocSnapshot>;
  get(query: Query): Promise<QuerySnapshot>;
  async get(target: DocRef | Query): Promise<DocSnapshot | QuerySnapshot> {
    if (target instanceof PgQuery) return target.run(this.runner);
    return (await this.store.read(this.runner, [target as DocRef]))[0] as DocSnapshot;
  }

  getAll(...refs: DocRef[]): Promise<DocSnapshot[]> {
    return this.store.read(this.runner, refs);
  }

  set(ref: DocRef, data: DocData): DocTransaction {
    this.writes.push({ kind: "set", ref, data });
    return this;
  }

  create(ref: DocRef, data: DocData): DocTransaction {
    this.writes.push({ kind: "create", ref, data });
    return this;
  }

  delete(ref: DocRef): DocTransaction {
    this.writes.push({ kind: "delete", ref });
    return this;
  }
}

function rowMeta(path: string): { parent: string; collectionId: string; ownerId: string | null } {
  const segs = segments(path, "document");
  return {
    parent: segs.slice(0, -1).join("/"),
    collectionId: segs.at(-2) as string,
    ownerId: segs[0] === "users" ? (segs[1] as string) : null,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The `DocStore` on Postgres: one `docs` table, SERIALIZABLE transactions retried on conflict. */
export class PgDocStore implements DocStore {
  readonly client: SqlClient;

  constructor(client: SqlClient) {
    this.client = client;
  }

  collection(path: string): CollectionRef {
    return new PgCollection(this, path);
  }

  collectionGroup(id: string): Query {
    if (!SEGMENT.test(id)) throw new Error(`invalid collection id: ${id}`);
    return new PgQuery(this, { kind: "group", id });
  }

  doc(path: string): DocRef {
    return new PgDoc(this, path);
  }

  getAll(...refs: DocRef[]): Promise<DocSnapshot[]> {
    return this.read(this.client, refs);
  }

  async runTransaction<T>(
    fn: (tx: DocTransaction) => Promise<T>,
    options?: { maxAttempts?: number },
  ): Promise<T> {
    const attempts = options?.maxAttempts ?? DEFAULT_ATTEMPTS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.client.serializable(async (runner) => {
          const tx = new PgTransaction(this, runner);
          const result = await fn(tx);
          for (const w of tx.writes) await this.write(runner, w);
          return result;
        });
      } catch (error) {
        const state = sqlState(error);
        if (state === undefined || !RETRYABLE_SQLSTATES.has(state)) throw error;
        if (attempt >= attempts)
          throw new DocStoreError(ABORTED, "transaction contended past its last attempt");
        await sleep(Math.floor(Math.random() * 20 * attempt) + 5);
      }
    }
  }

  /** @internal Reads in the order asked, missing documents included. */
  async read(runner: SqlRunner, refs: readonly DocRef[]): Promise<DocSnapshot[]> {
    if (refs.length === 0) return [];
    const paths = refs.map((r) => r.path);
    const { rows } = await runner.query(
      `select path, data from docs where path in (${paths.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
      paths,
    );
    const found = new Map(rows.map((r) => [r.path, parseData(r.data)]));
    return refs.map((r) => new Snapshot(r, found.get(r.path)));
  }

  /** @internal */
  async write(runner: SqlRunner, w: Write): Promise<void> {
    if (w.kind === "delete") {
      await runner.query("delete from docs where path = $1", [w.ref.path]);
      return;
    }
    const m = rowMeta(w.ref.path);
    const params = [w.ref.path, m.parent, m.collectionId, m.ownerId, JSON.stringify(w.data)];
    const insert =
      "insert into docs (path, parent, collection_id, owner_id, data) values ($1, $2, $3, $4, $5::text::jsonb)";
    if (w.kind === "set") {
      await runner.query(
        `${insert} on conflict (path) do update set data = excluded.data, updated_at = now()`,
        params,
      );
      return;
    }
    try {
      await runner.query(insert, params);
    } catch (error) {
      if (sqlState(error) === UNIQUE_VIOLATION)
        throw new DocStoreError(ALREADY_EXISTS, `document already exists: ${w.ref.path}`);
      throw error;
    }
  }
}
