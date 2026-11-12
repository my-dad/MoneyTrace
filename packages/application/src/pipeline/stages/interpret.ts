import { defaultParsers, evaluateParsers } from "@moneytrace/domain";
import type { StageCommit } from "../../ports/source-event-repository";
import { MAX_AI_QUESTIONS, SKIPPED_ANSWER } from "../../source-event-guards";
import type { Stage } from "./deps";

/** No reading to show: wait for the user to type what happened, never fail the message (CR-008). */
const awaitUser = (eventPatch: NonNullable<StageCommit["eventPatch"]>): StageCommit => ({
  nextStatus: "pending",
  pendingReason: "awaitingClarification",
  outputs: [],
  eventPatch,
});

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

  const answered = event.clarifications.filter((c) => c.answer !== null);
  const last = event.clarifications.at(-1);
  // The user skipped DeepSeek's question: go on with its reading so far (CR-008).
  if (last?.answer === SKIPPED_ANSWER) {
    const sofar = { candidate: event.candidate, extraction: event.extraction };
    return event.candidate === null ? awaitUser(sofar) : interpreted(sofar);
  }
  const result = await deps.gateway.interpret(
    ownerId,
    event.id,
    event.retainedText,
    {
      allowedCategories: [],
      nowMs: deps.clock.nowMs(),
      clarifications: answered.map((c) => ({ question: c.question, answer: c.answer ?? "" })),
    },
    answered.length,
  );
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
  if (value.kind === "question") {
    const extraction = { ...base, confidenceBp: 0 };
    // At the limit, show what it has instead of asking again: the user can still Record or Fix.
    if (event.clarifications.length >= MAX_AI_QUESTIONS) {
      const sofar = { candidate: value.candidate, extraction };
      return value.candidate === null ? awaitUser(sofar) : interpreted(sofar);
    }
    return {
      nextStatus: "pending",
      pendingReason: "aiQuestion",
      outputs: [],
      eventPatch: {
        candidate: value.candidate,
        extraction,
        clarifications: [
          ...event.clarifications,
          { question: value.text, options: value.options, answer: null, askedAtMs: deps.clock.nowMs(), answeredAtMs: null },
        ],
      },
    };
  }
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
