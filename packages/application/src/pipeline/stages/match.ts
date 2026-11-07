import { DEFAULT_MATCH_CONFIG, matchCandidate, type MatchResult } from "@moneytrace/domain";
import { isIncoming } from "../candidate-to-intent";
import type { PipelineDeps, Stage } from "./deps";

const CANDIDATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** The account only if exactly one instrument matches: two sharing an ending must ask. */
async function uniqueAccount(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  query: { provider?: string; mask?: string },
): Promise<string | null> {
  const found = await deps.instruments.findForCandidate(ownerId, query);
  const accounts = new Set(found.map((i) => i.linkedAccountId));
  return accounts.size === 1 ? ([...accounts][0] ?? null) : null;
}

const linkedId = (result: MatchResult): string | null =>
  "transactionId" in result ? result.transactionId : null;

export const matchStage: Stage = async (deps, ownerId, event) => {
  const { candidate } = event;
  if (candidate === null) return { nextStatus: "matched", outputs: [] };

  const resolvedAccountId =
    event.resolvedAccountId ??
    (candidate.provider === undefined
      ? null
      : await uniqueAccount(deps, ownerId, {
          provider: candidate.provider,
          ...(candidate.instrumentMask === undefined ? {} : { mask: candidate.instrumentMask }),
        }));
  const resolvedDestinationAccountId =
    event.resolvedDestinationAccountId ??
    (candidate.destinationMask === undefined
      ? null
      : await uniqueAccount(deps, ownerId, { mask: candidate.destinationMask }));

  let result: MatchResult = { kind: "none" };
  if (resolvedAccountId !== null && candidate.occurredAtMs !== null) {
    const existing = await deps.candidates.findRecent(ownerId, {
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      fromMs: candidate.occurredAtMs - CANDIDATE_LOOKBACK_MS,
      toMs: candidate.occurredAtMs + CANDIDATE_LOOKBACK_MS,
    });
    result = matchCandidate(
      candidate,
      resolvedAccountId,
      isIncoming(candidate.kind) ? "in" : "out",
      existing,
      DEFAULT_MATCH_CONFIG,
    );
  }
  return {
    nextStatus: "matched",
    outputs: [],
    eventPatch: {
      resolvedAccountId,
      resolvedDestinationAccountId,
      matchKind: result.kind,
      matchedTransactionId: linkedId(result),
    },
  };
};
