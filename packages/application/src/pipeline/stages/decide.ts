import {
  DomainError,
  Money,
  defaultPostingPolicy,
  decide,
  type AccountRef,
  type CurrencyCode,
  type DecisionInput,
  type MatchResult,
  type PostingIntent,
} from "@moneytrace/domain";
import type { SourceEventRecord, StageOutput } from "../../ports/source-event-repository";
import { stageOutputId } from "../../source-event-guards";
import { SYSTEM_CASH_ACCOUNT_ID } from "../../use-cases/bootstrap-user";
import { candidateToIntent, type ResolvedAccounts } from "../candidate-to-intent";
import { accountRef, type PipelineDeps, type Stage } from "./deps";
import { findMatch, linkedId } from "./match";

export async function resolveAccounts(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  event: SourceEventRecord,
): Promise<ResolvedAccounts> {
  const [source, destination, systemCash] = await Promise.all([
    accountRef(deps, ownerId, event.resolvedAccountId),
    accountRef(deps, ownerId, event.resolvedDestinationAccountId),
    accountRef(deps, ownerId, SYSTEM_CASH_ACCOUNT_ID),
  ]);
  const fallback: AccountRef = { id: SYSTEM_CASH_ACCOUNT_ID, kind: "cash", currency: "BDT" };
  return { source, destination, systemCash: systemCash ?? fallback };
}

/** Both postings the post stage would make must pass, so a refused fee never leaves a half-posted event. */
function invariantsHold(intent: ReturnType<typeof candidateToIntent>, fee: PostingIntent | null): boolean {
  if (intent === null) return true;
  try {
    defaultPostingPolicy.toEntries(intent);
    if (fee !== null) defaultPostingPolicy.toEntries(fee);
    return true;
  } catch (error) {
    if (error instanceof DomainError) return false;
    throw error;
  }
}

async function decisionInput(
  deps: PipelineDeps,
  ownerId: Parameters<Stage>[1],
  event: SourceEventRecord,
): Promise<DecisionInput> {
  const { candidate, extraction } = event;
  const parsersConflict = extraction?.parsersConflict === true;
  const currencySupported = candidate === null || candidate.currency === "BDT";
  const resolved = candidate !== null && currencySupported ? await resolveAccounts(deps, ownerId, event) : null;
  const intent = candidate !== null && resolved !== null ? candidateToIntent(candidate, resolved) : null;
  const fee =
    intent !== null && candidate?.feeMinor !== undefined && resolved?.source != null
      ? { type: "fee" as const, charged: resolved.source, amount: Money.ofMinor(candidate.feeMinor, candidate.currency as CurrencyCode) }
      : null;
  return {
    extractionUsable: candidate !== null || parsersConflict,
    invariantsPass: invariantsHold(intent, fee),
    accountMappingUnambiguous: intent !== null || !currencySupported,
    unresolvedDuplicateCandidate:
      event.matchKind === "ambiguous" ||
      event.matchKind === "possibleCounterpart" ||
      (event.matchKind === "duplicate" && event.userConfirmed),
    parsersConflict,
    source: extraction?.source ?? "deterministicParser",
    confidenceBp: extraction?.confidenceBp ?? 0,
    retriedAfterUnknownInChain: extraction?.retriedAfterUnknown === true,
    currencySupported,
    userConfirmed: event.userConfirmed,
    // CR-008: credit or debit is enough to know what it means.
    kindKnown: true,
    dateKnown: candidate === null || candidate.occurredAtMs !== null,
  };
}

function decisionRecord(
  deps: PipelineDeps,
  event: SourceEventRecord,
  stageAttempt: number,
  outcome: ReturnType<typeof decide>,
  input: DecisionInput,
): StageOutput {
  const id = stageOutputId(event.id, "decide", `decision-${String(stageAttempt)}`);
  const { extraction, candidate } = event;
  const provenance =
    extraction?.source === "ai" && extraction.ai !== undefined
      ? { source: "ai" as const, ai: extraction.ai }
      : {
          source: "deterministicParser" as const,
          parser: extraction?.parser ?? { name: "none", version: "0" },
        };
  return {
    collection: "decisionRecords",
    docId: id,
    data: {
      id,
      ...provenance,
      outcome: outcome.outcome,
      rule: outcome.rule,
      configVersion: deps.confidence.version,
      aiAutoPostThresholdBp: deps.confidence.aiAutoPostThresholdBp,
      confidenceBp: input.confidenceBp,
      evidenceFields: candidate === null ? [] : Object.keys(candidate),
      retriedAfterUnknown: input.retriedAfterUnknownInChain,
      sourceEventIds: [event.id],
      createdAtMs: deps.clock.nowMs(),
    },
  };
}

export const decideStage: Stage = async (deps, ownerId, parkedEvent, claim) => {
  let event = parkedEvent;
  if (event.candidate === null && event.extraction?.notFinancialReason !== undefined) {
    // A bank's own parser saying "declined" or "promotional" is exact. The AI saying "not about
    // money" may be wrong about real evidence, so the user decides (PRD: unclear goes to review).
    return event.extraction.source === "ai"
      ? { nextStatus: "pending", pendingReason: "awaitingClarification", outputs: [] }
      : { nextStatus: "rejected", outputs: [] };
  }
  if (event.matchKind === "duplicate" && !event.userConfirmed) {
    return { nextStatus: "linkedAsDuplicate", outputs: [] };
  }
  // The user supplied facts that matching never saw (a date, an account): look again before posting.
  let matchPatch: { matchKind: MatchResult["kind"]; matchedTransactionId: string | null } | undefined;
  if (event.userConfirmed && event.matchKind === null && event.candidate !== null && event.resolvedAccountId !== null) {
    const result = await findMatch(deps, ownerId, event.candidate, event.resolvedAccountId, event.receivedAtMs);
    matchPatch = { matchKind: result.kind, matchedTransactionId: linkedId(result) };
    event = { ...event, ...matchPatch };
  }
  const input = await decisionInput(deps, ownerId, event);
  const outcome = decide(input, deps.confidence);
  const outputs = [decisionRecord(deps, event, claim.stageAttempt, outcome, input)];
  const patch = matchPatch === undefined ? {} : { eventPatch: matchPatch };
  switch (outcome.outcome) {
    case "autoPost":
      return { nextStatus: "decided", outputs, ...patch };
    case "needsClarification":
      return { nextStatus: "pending", pendingReason: "awaitingClarification", outputs, ...patch };
    case "failed":
      return { nextStatus: "deadLetter", deadLetterReason: "stageFailed", outputs, ...patch };
  }
};
