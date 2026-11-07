import * as infrastructure from "@moneytrace/infrastructure";
import { describe, expect, it } from "vitest";

describe("@moneytrace/infrastructure", () => {
  it("exports the adapters and system services", () => {
    expect(Object.keys(infrastructure).sort()).toEqual([
      "CryptoIdGenerator",
      "FirestoreAccountRepository",
      "FirestoreLedgerReader",
      "FirestoreLedgerWriter",
      "FirestoreSourceEventRepository",
      "JsonLogger",
      "NodeHasher",
      "SystemClock",
      "ownerPath",
    ]);
  });
});
