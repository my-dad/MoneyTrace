import type { OwnerCollectionName } from "@moneytrace/contracts";
import { DomainError } from "@moneytrace/domain";

const SEGMENT = /^[A-Za-z0-9_:.-]{1,256}$/;
/** Firestore reserves document IDs of the form `__.*__`. */
const RESERVED = /^__.*__$/;

function segment(kind: string, s: string): string {
  // A segment with a slash, or "." / "..", would address a different document than intended.
  if (!SEGMENT.test(s) || s === "." || s === ".." || RESERVED.test(s)) {
    throw new DomainError("invalidId", `invalid ${kind} path segment`);
  }
  return s;
}

/** The single place owner-scoped Firestore paths are built: `users/{ownerId}/{collection}[/{id}]`. */
export function ownerPath(ownerId: string, collection: OwnerCollectionName, id?: string): string {
  const base = `users/${segment("owner", ownerId)}/${collection}`;
  return id === undefined ? base : `${base}/${segment("document", id)}`;
}
