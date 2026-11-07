import type { OwnerCollectionName } from "@moneytrace/contracts";

const SEGMENT = /^[A-Za-z0-9_:.-]{1,256}$/;

function segment(kind: string, s: string): string {
  // A segment with a slash, or "." / "..", would address a different document than intended.
  if (!SEGMENT.test(s) || s === "." || s === "..") throw new Error(`invalid ${kind} path segment`);
  return s;
}

/** The single place owner-scoped Firestore paths are built: `users/{ownerId}/{collection}[/{id}]`. */
export function ownerPath(ownerId: string, collection: OwnerCollectionName, id?: string): string {
  const base = `users/${segment("owner", ownerId)}/${collection}`;
  return id === undefined ? base : `${base}/${segment("document", id)}`;
}
