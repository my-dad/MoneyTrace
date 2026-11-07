import { RecoverExpiredClaims } from "../pipeline/recover-expired-claims";
import {
  ProviderCallExecutor,
  type AbortSignalLike,
  type ProviderCallExecutorDeps,
  type ProviderOutcome,
} from "../pipeline/provider-call-executor";
import { PurgeProviderResults } from "../pipeline/purge-provider-results";
import { RetryProviderCall } from "../pipeline/retry-provider-call";
import type { RetrySafety } from "@moneytrace/domain";
import { CapturingLogger, FakeClock, SequentialIdGenerator } from "./fakes";
import { InMemoryAiUsage, InMemoryQuota } from "./in-memory-quota";
import { InMemoryProviderCalls } from "./in-memory-provider-calls";
import { InMemorySourceEvents } from "./in-memory-source-events";

/** A signal that never aborts. */
export const liveSignal = (): AbortSignalLike => ({
  aborted: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

/** A signal that is already aborted, as a call that has just timed out sees it. */
export const abortedSignal = (): AbortSignalLike => ({
  aborted: true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

/** A signal the test aborts by hand, notifying listeners as the platform does. */
export function controllableSignal(): { signal: AbortSignalLike; abort(): void } {
  const listeners = new Set<() => void>();
  const state = { aborted: false };
  return {
    signal: {
      get aborted() {
        return state.aborted;
      },
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
    },
    abort: () => {
      state.aborted = true;
      for (const l of [...listeners]) l();
    },
  };
}

export type ScriptedStep<T> = ProviderOutcome<T> | Error | "hang";

/** A provider that counts calls and plays scripted outcomes; the default is `success: "ok"`. */
export class FakeProvider {
  readonly id: string;
  readonly retrySafety: RetrySafety;
  calls = 0;
  readonly keys: string[] = [];
  onInvoke: (() => Promise<void>) | undefined;
  private steps: ScriptedStep<unknown>[] = [];

  constructor(id: string, retrySafety: RetrySafety) {
    this.id = id;
    this.retrySafety = retrySafety;
  }

  /** Queues outcomes, one per call. */
  script(...steps: ScriptedStep<unknown>[]): void {
    this.steps.push(...steps);
  }

  invoke = async (requestKey: string): Promise<ProviderOutcome<unknown>> => {
    this.calls += 1;
    this.keys.push(requestKey);
    if (this.onInvoke !== undefined) await this.onInvoke();
    const step = this.steps.shift() ?? { kind: "success", value: "ok" };
    if (step === "hang") return new Promise<never>(() => undefined);
    if (step instanceof Error) throw step;
    return step;
  };
}

/** One fully wired in-memory pipeline, for provider call tests. */
export function createProviderWorld() {
  const clock = new FakeClock();
  const ids = new SequentialIdGenerator();
  const logger = new CapturingLogger();
  const sourceEvents = new InMemorySourceEvents(clock);
  const calls = new InMemoryProviderCalls(sourceEvents, clock);
  const quota = new InMemoryQuota(clock, ids);
  const usage = new InMemoryAiUsage();
  return {
    clock,
    ids,
    logger,
    sourceEvents,
    calls,
    quota,
    usage,
    executor: (over: Partial<ProviderCallExecutorDeps> = {}) =>
      new ProviderCallExecutor({
        providerCalls: calls,
        quota,
        usage,
        clock,
        logger,
        timeoutSignal: liveSignal,
        ...over,
      }),
    recovery: () =>
      new RecoverExpiredClaims({ sourceEvents, providerCalls: calls, usage, clock, logger }),
    retry: () => new RetryProviderCall({ sourceEvents, providerCalls: calls, clock }),
    purge: () => new PurgeProviderResults({ providerCalls: calls, logger }),
  };
}
