import { createHash } from "node:crypto";
import { OWNER_DATA_REGISTRY, type OwnerCollectionName } from "@moneytrace/contracts";
import { ownerPath, userPath } from "@moneytrace/infrastructure";
import type { Firestore } from "firebase-admin/firestore";

export type CollectionChecksum = { count: number; sha256: string };

export type DataChecksum = {
  collections: Record<OwnerCollectionName, CollectionChecksum>;
  profileSha256: string;
  deletionLogSha256: string;
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

async function checksumCollection(db: Firestore, path: string): Promise<CollectionChecksum> {
  const snapshot = await db.collection(path).get();
  const documents = snapshot.docs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((document) => ({ id: document.id, data: document.data() }));
  return { count: documents.length, sha256: sha256(documents) };
}

async function checksumDocumentCollection(db: Firestore, path: string): Promise<string> {
  const snapshot = await db.collection(path).get();
  const documents = snapshot.docs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((document) => ({ id: document.id, data: document.data() }));
  return sha256(documents);
}

export async function dataChecksum(db: Firestore, ownerId: string): Promise<DataChecksum> {
  const collections = {} as Record<OwnerCollectionName, CollectionChecksum>;
  for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
    collections[name] = await checksumCollection(db, ownerPath(ownerId, name));
  }
  return {
    collections,
    profileSha256: sha256((await db.doc(userPath(ownerId)).get()).data() ?? null),
    deletionLogSha256: await checksumDocumentCollection(db, "deletionLog"),
  };
}

export function diffChecksums(expected: DataChecksum, actual: DataChecksum): string[] {
  const differences: string[] = [];
  for (const name of Object.keys(OWNER_DATA_REGISTRY) as OwnerCollectionName[]) {
    if (JSON.stringify(expected.collections[name]) !== JSON.stringify(actual.collections[name])) {
      differences.push(name);
    }
  }
  if (expected.profileSha256 !== actual.profileSha256) differences.push("profile");
  if (expected.deletionLogSha256 !== actual.deletionLogSha256) differences.push("deletionLog");
  return differences;
}

export function stableJson(value: unknown): string {
  return canonical(value);
}
