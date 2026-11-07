/** Ordered `callTimeoutMs < functionExecutionTimeoutMs < leaseMs`, so an expired lease means the worker has ended. */
export const PIPELINE_TIMEOUTS = {
  callTimeoutMs: 60_000,
  functionExecutionTimeoutMs: 120_000,
  leaseMs: 180_000,
  maxAttempts: 3,
} as const;
