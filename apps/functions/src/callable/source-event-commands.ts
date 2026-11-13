import { COMMANDS } from "@moneytrace/contracts";
import { asSourceEventId } from "@moneytrace/domain";
import { command } from "./command";

export const submitEvidence = command(COMMANDS.submitEvidence, (ctx, data) =>
    ctx.deps.intakeEvidence.execute({
      ownerId: ctx.ownerId,
      idempotencyKey: data.idempotencyKey,
      text: data.text,
    }),
  );

export const confirmCandidate = command(COMMANDS.confirmCandidate, (ctx, data) =>
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

export const retrySourceEvent = command(COMMANDS.retrySourceEvent, (ctx, data) =>
    ctx.deps.retrySourceEvent.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
    }),
  );

export const cancelSourceEvent = command(COMMANDS.cancelSourceEvent, (ctx, data) =>
    ctx.deps.cancelSourceEvent.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
    }),
  );

export const answerQuestion = command(COMMANDS.answerQuestion, (ctx, data) =>
    ctx.deps.answerQuestion.execute({
      ownerId: ctx.ownerId,
      sourceEventId: asSourceEventId(data.sourceEventId),
      ...(data.answer === undefined ? {} : { answer: data.answer }),
      ...(data.skip === true ? { skip: true as const } : {}),
    }),
  );
