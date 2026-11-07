import * as infrastructure from "@moneytrace/infrastructure";
import { describe, expect, it } from "vitest";

describe("@moneytrace/infrastructure", () => {
  it("exports the adapters and system services", () => {
    expect(Object.keys(infrastructure).sort()).toEqual([
      "CryptoIdGenerator",
      "FirestoreAccountRepository",
      "FirestoreAiUsageRecorder",
      "FirestoreLedgerReader",
      "FirestoreLedgerWriter",
      "FirestoreProviderCallRepository",
      "FirestoreQuotaLedger",
      "FirestoreSourceEventRepository",
      "FirestoreUserProfileRepository",
      "JsonLogger",
      "NodeHasher",
      "SystemClock",
      "ownerPath",
      "systemTimeoutSignal",
      "userPath",
    ]);
  });
});
