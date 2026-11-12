import { z } from "zod";
import { currencyCode, documentId, epochMs, positiveMinorAmount } from "../primitives";
import { evidenceText, strictObject } from "./shared";

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
  /** `link` says this evidence is the same transaction as one already recorded. */
  decision: z.enum(["confirm", "reject", "link"]),
  overrides: strictObject({
    kind: z
      .enum([
        "withdrawal",
        "cardPurchase",
        "cardRepayment",
        "purchase",
        "income",
        "fee",
        "refund",
        "transfer",
      ])
      .optional(),
    amountMinor: positiveMinorAmount.optional(),
    currency: currencyCode.optional(),
    accountId: documentId.optional(),
    destinationAccountId: documentId.optional(),
    occurredAtMs: epochMs.optional(),
    category: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(64)
      .optional(),
  }).optional(),
});
export const confirmCandidateResponse = strictObject({
  status: z.enum(["pending", "rejected", "linked"]),
});

export const retrySourceEventRequest = strictObject({ sourceEventId: documentId });
export const retrySourceEventResponse = strictObject({ status: sourceEventStatus });
/** The user's answer to DeepSeek's latest question about this evidence, or a skip. */
export const answerQuestionRequest = strictObject({
  sourceEventId: documentId,
  answer: z.string().trim().min(1).max(500).optional(),
  skip: z.literal(true).optional(),
}).refine((r) => (r.answer === undefined) !== (r.skip === undefined), { message: "give an answer or skip, not both" });
export const answerQuestionResponse = strictObject({ status: sourceEventStatus });
export const cancelSourceEventRequest = strictObject({ sourceEventId: documentId });
export const cancelSourceEventResponse = strictObject({ status: sourceEventStatus });

export const resolveFollowUpRequest = strictObject({
  followUpId: documentId,
  resolution: z.discriminatedUnion("kind", [
    strictObject({ kind: z.literal("destination"), accountId: documentId }),
    strictObject({ kind: z.literal("notSureYet") }),
  ]),
});
export const resolveFollowUpResponse = strictObject({ state: z.enum(["resolved", "open"]) });
export const snoozeFollowUpRequest = strictObject({ followUpId: documentId, untilMs: epochMs });
export const snoozeFollowUpResponse = strictObject({ state: z.literal("snoozed") });
