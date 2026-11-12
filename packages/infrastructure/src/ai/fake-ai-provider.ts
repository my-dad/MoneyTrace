import type {
  AIProvider,
  AiContext,
  AiInterpretation,
  ProviderOutcome,
} from "@moneytrace/application";

const CASH_NOTE = /\b(?:paid|spent)\s+(\d+)\b/i;

/**
 * For local emulators only; startup refuses it anywhere else. It reads simple cash notes so
 * end-to-end tests run with no network and no key. Its confidence stays below any auto-post level.
 */
export class FakeAIProvider implements AIProvider {
  readonly id = "fake";
  readonly model = "fake";
  readonly promptVersion = "fake-v1";
  readonly retrySafety = "none" as const;

  interpretEvidence(input: {
    text: string;
    context: AiContext;
  }): Promise<ProviderOutcome<AiInterpretation>> {
    const m = input.text.match(CASH_NOTE);
    if (m === null) return Promise.resolve({ kind: "success", value: { kind: "unusable" } });
    return Promise.resolve({
      kind: "success",
      value: {
        kind: "transaction",
        confidenceBp: 5000,
        candidate: {
          kind: "purchase",
          amountMinor: Number(m[1]) * 100,
          currency: "BDT",
          occurredAtMs: input.context.nowMs,
          // A cash note: the money left the user's Cash (CR-008).
          provider: "cash",
        },
      },
    });
  }
}
