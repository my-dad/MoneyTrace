import {
  DomainError,
  defaultPostingPolicy,
  decide,
  type AccountRef,
  type DecisionInput,
} from "@moneytrace/domain";
import type { SourceEventRecord, StageOutput } from "../../ports/source-event-repository";
import { stageOutputId } from "../../source-event-guards";
import { SYSTEM_CASH_ACCOUNT_ID } from "../../use-cases/bootstrap-user";
import { candidateToIntent, type ResolvedAccounts } from "../candidate-to-intent";
import { accountRef, type PipelineDeps, type Stage } from "./deps";

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

function invariantsHold(intent: ReturnType<typeof candidateToIntent>): boolean {
  if (intent === null) return true;
  try {
    defaultPostingPolicy.toEntries(intent);
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
  const unclassified =
    candidate?.kind === "unclassifiedCredit" || candidate?.kind === "unclassifiedDebit";
  const intent =
    candidate !== null && currencySupported
      ? candidateToIntent(candidate, await resolveAccounts(deps, ownerId, event))
      : null;
  return {
    extractionUsable: candidate !== null || parsersConflict,
    invariantsPass: invariantsHold(intent),
    accountMappingUnambiguous: unclassified
      ? event.resolvedAccountId !== null
      : intent !== null || !currencySupported,
    unresolvedDuplicateCandidate:
      event.matchKind === "ambiguous" || event.matchKind === "possibleCounterpart",
    parsersConflict,
    source: extraction?.source ?? "deterministicParser",
    confidenceBp: extraction?.confidenceBp ?? 0,
    retriedAfterUnknownInChain: extraction?.retriedAfterUnknown === true,
    currencySupported,
    userConfirmed: event.userConfirmed,
    kindKnown: !unclassified,
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

export const decideStage: Stage = async (deps, ownerId, event, claim) => {
  if (event.candidate === null && event.extraction?.notFinancialReason !== undefined) {
    return { nextStatus: "rejected", outputs: [] };
  }
  if (event.matchKind === "duplicate" && !event.userConfirmed) {
    return { nextStatus: "linkedAsDuplicate", outputs: [] };
  }
  const input = await decisionInput(deps, ownerId, event);
  const outcome = decide(input, deps.confidence);
  const outputs = [decisionRecord(deps, event, claim.stageAttempt, outcome, input)];
  switch (outcome.outcome) {
    case "autoPost":
      return { nextStatus: "decided", outputs };
    case "needsClarification":
      return { nextStatus: "pending", pendingReason: "awaitingClarification", outputs };
    case "failed":
      return { nextStatus: "deadLetter", deadLetterReason: "stageFailed", outputs };
  }
};
