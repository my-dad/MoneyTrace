import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OWNER_COLLECTIONS, type OwnerCollectionName } from "./collections";
import { OWNER_DATA_REGISTRY } from "./owner-data-registry";

function headingsInSchemaDoc(): string[] {
  const path = fileURLToPath(
    new URL("../../../../docs/architecture/firestore-schema.md", import.meta.url),
  );
  return [...readFileSync(path, "utf8").matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1] as string);
}

describe("OWNER_DATA_REGISTRY", () => {
  it("every owner collection is registered, and the registry has no extras", () => {
    expect(Object.keys(OWNER_DATA_REGISTRY).sort()).toEqual(Object.keys(OWNER_COLLECTIONS).sort());
  });
  it("every collection named in the schema document is registered", () => {
    expect(headingsInSchemaDoc().sort()).toEqual(Object.keys(OWNER_COLLECTIONS).sort());
  });
  it("only idempotency records are excluded from export", () => {
    const excluded = Object.entries(OWNER_DATA_REGISTRY)
      .filter(([, v]) => v.exportTreatment === "excluded")
      .map(([k]) => k);
    expect(excluded).toEqual(["idempotencyRecords"]);
  });
  it("clientRead is false only for server-internal collections", () => {
    const hidden = Object.entries(OWNER_DATA_REGISTRY)
      .filter(([, v]) => !v.clientRead)
      .map(([k]) => k)
      .sort();
    expect(hidden).toEqual([
      "deletionJobs",
      "idempotencyRecords",
      "providerCalls",
      "quotaCounters",
    ]);
  });
  it("assigns the timed retention classes", () => {
    const timed = Object.entries(OWNER_DATA_REGISTRY)
      .filter(([, v]) => v.retentionClass !== "untilAccountDeletion")
      .map(([k, v]) => [k, v.retentionClass]);
    expect(Object.fromEntries(timed)).toEqual({
      providerCalls: "providerResult",
      conversations: "conversation",
      conversationMessages: "conversation",
      temporaryUploads: "temporaryUpload",
    });
  });
  it.each<OwnerCollectionName>([
    "transactions",
    "ledgerEntries",
    "decisionRecords",
    "sourceEvents",
    "cutoverMarkers",
  ])("audit collection %s is never on a timed retention class", (name) => {
    expect(OWNER_DATA_REGISTRY[name].retentionClass).toBe("untilAccountDeletion");
  });
});
