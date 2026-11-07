/** The platform's timeout signal, supplied to `ProviderCallExecutor` as its `timeoutSignal`. */
export function systemTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}
