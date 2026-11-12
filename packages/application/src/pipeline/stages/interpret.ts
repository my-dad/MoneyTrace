import { defaultParsers, evaluateParsers } from "@moneytrace/domain";
import type { StageCommit } from "../../ports/source-event-repository";
import type { Stage } from "./deps";

const interpreted = (eventPatch: StageCommit["eventPatch"]): StageCommit => ({
  nextStatus: "interpreted",
  outputs: [],
  ...(eventPatch === undefined ? {} : { eventPatch }),
});

/** Deterministic parsers first. AI runs only when none recognizes the text. */
export const interpretStage: Stage = async (deps, ownerId, event) => {
  const evaluation = evaluateParsers(defaultParsers, event.retainedText);
  if (evaluation.outcome === "conflict") {
    const reading = evaluation.transaction;
    // A bank SMS with promotional wording: keep the bank's reading for the user to confirm.
    return reading === undefined
      ? interpreted({ candidate: null, extraction: { source: null, confidenceBp: 0, parsersConflict: true } })
      : interpreted({
          candidate: reading.candidate,
          extraction: { source: "deterministicParser", parser: reading.parser, confidenceBp: reading.confidenceBp, parsersConflict: true },
        });
  }
  if (evaluation.outcome === "match") {
    const { parser, parsed } = evaluation;
    const base = { source: "deterministicParser" as const, parser };
    return parsed.kind === "notFinancial"
      ? interpreted({
          candidate: null,
          extraction: { ...base, confidenceBp: 0, notFinancialReason: parsed.reason },
        })
      : interpreted({
          candidate: parsed.candidate,
          extraction: { ...base, confidenceBp: parsed.confidenceBp },
        });
  }

  const result = await deps.gateway.interpret(ownerId, event.id, event.retainedText, {
    allowedCategories: [],
    nowMs: deps.clock.nowMs(),
  });
  switch (result.kind) {
    case "retryLater":
      return "retryLater";
    case "awaitUserDecision":
      return { nextStatus: "pending", pendingReason: "providerOutcomeUnknown", outputs: [] };
    case "quotaExhausted":
      return { nextStatus: "pending", pendingReason: "aiQuotaExhausted", outputs: [] };
    case "resultMissing":
      return { nextStatus: "deadLetter", deadLetterReason: "providerResultMissing", outputs: [] };
    case "exhausted":
      return { nextStatus: "deadLetter", deadLetterReason: "attemptsExhausted", outputs: [] };
    case "result":
      break;
  }
  const base = {
    source: "ai" as const,
    ai: deps.gateway.identity,
    retriedAfterUnknown: result.retriedAfterUnknown,
  };
  const { value } = result;
  if (value.kind === "transaction") {
    return interpreted({
      candidate: value.candidate,
      extraction: { ...base, confidenceBp: value.confidenceBp },
    });
  }
  return interpreted({
    candidate: null,
    extraction: {
      ...base,
      confidenceBp: 0,
      ...(value.kind === "notFinancial" ? { notFinancialReason: value.reason } : {}),
    },
  });
};
