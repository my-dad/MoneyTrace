import * as infrastructure from "@moneytrace/infrastructure";
import { describe, expect, it } from "vitest";

describe("@moneytrace/infrastructure", () => {
  it("exports the adapters and system services", () => {
    expect(Object.keys(infrastructure).sort()).toEqual([
      "ABORTED",
      "ALREADY_EXISTS",
      "CryptoIdGenerator",
      "DeepSeekProvider",
      "DocStoreError",
      "FakeAIProvider",
      "FirestoreAccountRepository",
      "FirestoreAiUsageRecorder",
      "FirestoreFollowUpRepository",
      "FirestoreLedgerReader",
      "FirestoreLedgerWriter",
      "FirestorePaymentInstrumentRepository",
      "FirestoreProviderCallRepository",
      "FirestoreQuotaLedger",
      "FirestoreRateLimiter",
      "FirestoreReconciliationRepository",
      "FirestoreSourceEventRepository",
      "FirestoreUserProfileRepository",
      "JsonLogger",
      "NodeHasher",
      "PgDocStore",
      "RATE_LIMIT_COLLECTION",
      "RETRYABLE_SQLSTATES",
      "SystemClock",
      "UNIQUE_VIOLATION",
      "fromFirestore",
      "ownerPath",
      "postgresJsClient",
      "sqlState",
      "systemTimeoutSignal",
      "userPath",
    ]);
  });
});
