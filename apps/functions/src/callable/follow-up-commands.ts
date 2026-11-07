import { COMMANDS } from "@moneytrace/contracts";
import type { Deps } from "../composition";
import { createCallable } from "./create-callable";

export const resolveFollowUp = (getDeps: () => Deps) =>
  createCallable(COMMANDS.resolveFollowUp, getDeps, (ctx, data) =>
    ctx.deps.resolveFollowUp.execute({
      ownerId: ctx.ownerId,
      followUpId: data.followUpId,
      resolution: data.resolution,
    }),
  );

export const snoozeFollowUp = (getDeps: () => Deps) =>
  createCallable(COMMANDS.snoozeFollowUp, getDeps, (ctx, data) =>
    ctx.deps.snoozeFollowUp.execute({
      ownerId: ctx.ownerId,
      followUpId: data.followUpId,
      untilMs: data.untilMs,
    }),
  );

export const recordCustodyTransfer = (getDeps: () => Deps) =>
  createCallable(COMMANDS.recordCustodyTransfer, getDeps, (ctx, data) =>
    ctx.deps.recordCustodyTransfer.execute({ ownerId: ctx.ownerId, ...data }),
  );

export const correctTransaction = (getDeps: () => Deps) =>
  createCallable(COMMANDS.correctTransaction, getDeps, (ctx, data) =>
    ctx.deps.correctTransaction.execute({
      ownerId: ctx.ownerId,
      idempotencyKey: data.idempotencyKey,
      transactionId: data.transactionId,
      rationale: data.rationale,
      ...(data.replacement === undefined
        ? {}
        : {
            replacement: {
              amountMinor: data.replacement.amountMinor,
              currency: data.replacement.currency,
              ...(data.replacement.occurredAtMs === undefined
                ? {}
                : { occurredAtMs: data.replacement.occurredAtMs }),
            },
          }),
    }),
  );

export const updateSettings = (getDeps: () => Deps) =>
  createCallable(COMMANDS.updateSettings, getDeps, (ctx, data) =>
    ctx.deps.updateSettings.execute({
      ownerId: ctx.ownerId,
      ...(data.timezone === undefined ? {} : { timezone: data.timezone }),
      ...(data.reminders === undefined
        ? {}
        : {
            reminders: {
              digestLocalTime: data.reminders.digestLocalTime,
              frequency: data.reminders.frequency,
              minThresholdMinor: data.reminders.minThresholdMinor,
            },
          }),
      ...(data.reportingCycle === undefined ? {} : { reportingCycle: data.reportingCycle }),
      ...(data.aiBudget === undefined ? {} : { aiBudget: data.aiBudget }),
    }),
  );
