import { describe, expect, it } from "vitest";
import {
  nextProviderAction,
  type ProviderAction,
  type ProviderCallState,
  type RetrySafety,
} from "./provider-call";

type Row = [ProviderCallState | null, boolean, RetrySafety, number, boolean, ProviderAction];
const ROWS: Row[] = [
  [null, false, "none", 0, false, "invoke"],
  [null, false, "localPure", 0, false, "invoke"],
  ["succeeded", true, "none", 1, false, "reuseResult"],
  ["succeeded", true, "none", 1, true, "reuseResult"],
  ["succeeded", false, "none", 1, false, "resultMissing"],
  ["succeeded", false, "none", 1, true, "invoke"],
  ["purged", false, "none", 1, false, "resultMissing"],
  ["purged", false, "none", 1, true, "invoke"],
  ["failed", false, "none", 1, false, "invoke"],
  ["failed", false, "none", 3, false, "exhausted"],
  ["unknown", false, "none", 1, false, "awaitUserDecision"],
  ["unknown", false, "none", 1, true, "invoke"],
  ["unknown", false, "none", 3, false, "awaitUserDecision"],
  ["unknown", false, "idempotentKey", 1, false, "invoke"],
  ["unknown", false, "localPure", 1, false, "invoke"],
  ["unknown", false, "idempotentKey", 3, false, "exhausted"],
  ["started", false, "none", 1, false, "awaitUserDecision"],
  ["started", false, "localPure", 1, false, "invoke"],
];

describe("nextProviderAction", () => {
  it.each(ROWS)(
    "state=%s hasResult=%s safety=%s attempts=%s approved=%s -> %s",
    (state, hasResult, retrySafety, attemptCount, userApprovedRetry, expected) => {
      expect(
        nextProviderAction({
          state,
          hasResult,
          retrySafety,
          attemptCount,
          maxAttempts: 3,
          userApprovedRetry,
        }),
      ).toBe(expected);
    },
  );
});
