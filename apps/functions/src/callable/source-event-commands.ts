import { COMMANDS } from "@moneytrace/contracts";
import { asSourceEventId } from "@moneytrace/domain";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const submitEvidence = (getDeps: () => Deps) =>
  createCallable(COMMANDS.submitEvidence, getDeps, (ctx, data) =>
    ctx.deps.intakeEvidence.execute({
      ownerId: ctx.ownerId,
      idempotencyKey: data.idempotencyKey,
      text: data.text,
    }),
  );

export const confirmCandidate = (getDeps: () => Deps) =>
  createCallable(COMMANDS.confirmCandidate, getDeps, (ctx, data) =>
    ctx.deps.confirmCandidate.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
      decision: data.decision,
      ...(data.overrides === undefined
        ? {}
        : {
            overrides: Object.fromEntries(
              Object.entries(data.overrides).filter(([, v]) => v !== undefined),
            ),
          }),
    }),
  );

export const retrySourceEvent = (getDeps: () => Deps) =>
  createCallable(COMMANDS.retrySourceEvent, getDeps, (ctx, data) =>
    ctx.deps.retrySourceEvent.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
    }),
  );

export const cancelSourceEvent = (getDeps: () => Deps) =>
  createCallable(COMMANDS.cancelSourceEvent, getDeps, (ctx, data) =>
    ctx.deps.cancelSourceEvent.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
    }),
  );

export const answerQuestion = (getDeps: () => Deps) =>
  createCallable(COMMANDS.answerQuestion, getDeps, (ctx, data) =>
    ctx.deps.answerQuestion.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
      ...(data.answer === undefined ? {} : { answer: data.answer }),
      ...(data.skip === true ? { skip: true as const } : {}),
    }),
  );
