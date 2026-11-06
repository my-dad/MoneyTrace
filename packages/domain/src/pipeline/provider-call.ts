import { DomainError } from "../errors";

export type ProviderCallState = "started" | "succeeded" | "failed" | "unknown" | "purged";

export type RetrySafety = "idempotentKey" | "localPure" | "none";

export type ProviderAction =
  "invoke" | "reuseResult" | "awaitUserDecision" | "resultMissing" | "exhausted";

export type ProviderCallInput = {
  state: ProviderCallState | null;
  hasResult: boolean;
  retrySafety: RetrySafety;
  attemptCount: number;
  maxAttempts: number;
  userApprovedRetry: boolean;
};

/**
 * Decides whether a paid or external provider call may run again.
 * A call whose outcome is unknown is never repeated automatically for `none` providers.
 */
export function nextProviderAction(input: ProviderCallInput): ProviderAction {
  const { state, hasResult, retrySafety, attemptCount, maxAttempts, userApprovedRetry } = input;
  if (
    !Number.isInteger(attemptCount) ||
    attemptCount < 0 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 0
  ) {
    throw new DomainError(
      "invalidConfig",
      "attemptCount and maxAttempts must be non-negative integers",
    );
  }
  if (state === null) return "invoke";
  if (state === "succeeded" && hasResult) return "reuseResult";
  if (state === "succeeded" || state === "purged")
    return userApprovedRetry ? "invoke" : "resultMissing";
  if (state === "failed") return attemptCount >= maxAttempts ? "exhausted" : "invoke";
  // state is "unknown" or "started": the outcome of the earlier attempt is not observed.
  if (retrySafety === "none") return userApprovedRetry ? "invoke" : "awaitUserDecision";
  return attemptCount >= maxAttempts ? "exhausted" : "invoke";
}
