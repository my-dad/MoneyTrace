/**
 * The slice of a Firestore-shaped document database the adapters use (PRD CR-010). Postgres
 * implements it (`PgDocStore`); the shapes match `firebase-admin/firestore`, so the adapters keep
 * their logic and their contract tests. Data is plain JSON: strings, numbers, booleans, null, arrays,
 * maps. Errors carry Firestore's gRPC codes: `create` on an existing document fails with
 * `ALREADY_EXISTS` (6); a transaction still contended after its last attempt fails with `ABORTED` (10).
 */
export type DocData = Record<string, unknown>;

export type WhereOp = "==" | "<" | "<=" | ">" | ">=";

export interface DocSnapshot {
  readonly exists: boolean;
  readonly id: string;
  readonly ref: DocRef;
  data(): DocData | undefined;
  /** A dotted field path, like Firestore's `get`. */
  get(field: string): unknown;
}

/** A query result always exists, so its data is never undefined. */
export interface QueryDocSnapshot extends DocSnapshot {
  data(): DocData;
}

export interface QuerySnapshot {
  readonly docs: QueryDocSnapshot[];
  readonly empty: boolean;
  readonly size: number;
  forEach(fn: (doc: QueryDocSnapshot) => void): void;
}

export interface Query {
  where(field: string, op: WhereOp, value: unknown): Query;
  orderBy(field: string, direction?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
}

export interface CollectionRef extends Query {
  readonly id: string;
  readonly path: string;
  /** The document holding this collection; null for a top-level collection. */
  readonly parent: DocRef | null;
  doc(id: string): DocRef;
}

export interface DocRef {
  readonly id: string;
  readonly path: string;
  readonly parent: CollectionRef;
  collection(id: string): CollectionRef;
  get(): Promise<DocSnapshot>;
  set(data: DocData): Promise<unknown>;
  create(data: DocData): Promise<unknown>;
  delete(): Promise<unknown>;
}

/** Firestore semantics: reads see committed state; writes apply together when the function returns. */
export interface DocTransaction {
  get(ref: DocRef): Promise<DocSnapshot>;
  get(query: Query): Promise<QuerySnapshot>;
  getAll(...refs: DocRef[]): Promise<DocSnapshot[]>;
  set(ref: DocRef, data: DocData): DocTransaction;
  create(ref: DocRef, data: DocData): DocTransaction;
  delete(ref: DocRef): DocTransaction;
}

export interface DocStore {
  collection(path: string): CollectionRef;
  collectionGroup(id: string): Query;
  doc(path: string): DocRef;
  getAll(...refs: DocRef[]): Promise<DocSnapshot[]>;
  runTransaction<T>(
    fn: (tx: DocTransaction) => Promise<T>,
    options?: { maxAttempts?: number },
  ): Promise<T>;
}

/** gRPC codes the adapters already test for. */
export const ALREADY_EXISTS = 6;
export const ABORTED = 10;

export class DocStoreError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "DocStoreError";
    this.code = code;
  }
}
