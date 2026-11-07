import { z } from "zod";
import { minorAmount, positiveMinorAmount } from "./primitives";

/** What the model must return. Anything else is treated as unusable, never repaired. */
export const aiInterpretationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("transaction"),
      confidenceBp: z.number().int().min(0).max(10000),
      candidate: z
        .object({
          kind: z.enum([
            "withdrawal",
            "cardTransaction",
            "cardRepayment",
            "purchase",
            "income",
            "fee",
            "refund",
            "transfer",
            "unclassifiedCredit",
            "unclassifiedDebit",
          ]),
          amountMinor: positiveMinorAmount,
          feeMinor: positiveMinorAmount.optional(),
          currency: z.string().regex(/^[A-Z]{3}$/),
          occurredAtIso: z.iso.datetime({ offset: true }).nullable(),
          instrumentMask: z
            .string()
            .regex(/^\d{3,4}$/)
            .optional(),
          destinationMask: z
            .string()
            .regex(/^\d{3,4}$/)
            .optional(),
          counterparty: z.string().min(1).max(200).optional(),
          category: z
            .string()
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
            .max(64)
            .optional(),
          reference: z.string().min(1).max(64).optional(),
          balanceAfterMinor: minorAmount.optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ kind: z.literal("notFinancial"), reason: z.string().min(1).max(64) }).strict(),
]);

export type AiInterpretationOutput = z.infer<typeof aiInterpretationSchema>;
