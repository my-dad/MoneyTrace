import { z } from "zod";
import { currencyCode, documentId, epochMs, positiveMinorAmount } from "../primitives";
import { evidenceText, shortText, strictObject } from "./shared";

const sourceEventStatus = z.enum([
  "received",
  "normalized",
  "interpreted",
  "matched",
  "decided",
  "posted",
  "linkedAsDuplicate",
  "rejected",
  "cancelled",
  "pending",
  "deadLetter",
]);

export const submitEvidenceRequest = strictObject({
  idempotencyKey: documentId,
  text: evidenceText,
});
export const submitEvidenceResponse = strictObject({
  sourceEventId: documentId,
  status: sourceEventStatus,
  duplicate: z.boolean(),
});

export const sendChatMessageRequest = strictObject({
  conversationId: documentId,
  text: evidenceText,
});
export const sendChatMessageResponse = strictObject({
  messageId: documentId,
  status: z.enum(["accepted", "pending"]),
});

export const confirmCandidateRequest = strictObject({
  sourceEventId: documentId,
  decision: z.enum(["confirm", "reject"]),
  overrides: strictObject({
    amountMinor: positiveMinorAmount.optional(),
    currency: currencyCode.optional(),
    accountId: documentId.optional(),
    occurredAtMs: epochMs.optional(),
  }).optional(),
});
export const confirmCandidateResponse = strictObject({
  status: z.enum(["recorded", "rejected", "pending"]),
  transactionId: documentId.optional(),
});

export const retrySourceEventRequest = strictObject({ sourceEventId: documentId });
export const retrySourceEventResponse = strictObject({ status: sourceEventStatus });
export const cancelSourceEventRequest = strictObject({ sourceEventId: documentId });
export const cancelSourceEventResponse = strictObject({ status: sourceEventStatus });

export const resolveFollowUpRequest = strictObject({
  followUpId: documentId,
  resolution: z.discriminatedUnion("kind", [
    strictObject({ kind: z.literal("answer"), text: shortText }),
    strictObject({ kind: z.literal("dismiss") }),
  ]),
});
export const resolveFollowUpResponse = strictObject({ state: z.enum(["resolved", "dismissed"]) });
export const snoozeFollowUpRequest = strictObject({ followUpId: documentId, untilMs: epochMs });
export const snoozeFollowUpResponse = strictObject({ state: z.literal("snoozed") });
