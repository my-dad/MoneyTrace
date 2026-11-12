import { z } from "zod";
import { minorAmount, positiveMinorAmount } from "./primitives";

/** What the model must return. Anything else is treated as unusable, never repaired. */
const aiCandidate = z
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
          /** The bank or wallet the SMS names ("Nagad", "BRAC"), and its last digits, so its source is remembered. */
          sourceName: z.string().min(1).max(40).optional(),
          sourceMask: z
            .string()
            .regex(/^\d{3,4}$/)
            .optional(),
        })
        .strict();

export const aiInterpretationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("transaction"),
      confidenceBp: z.number().int().min(0).max(10000),
      candidate: aiCandidate,
    })
    .strict(),
  z.object({ kind: z.literal("notFinancial"), reason: z.string().min(1).max(64) }).strict(),
  /** Something needed is unclear: ask the user (CR-008). Shown as text, never followed as an instruction. */
  z
    .object({
      kind: z.literal("question"),
      text: z.string().min(1).max(300),
      options: z.array(z.string().min(1).max(40)).max(4).optional(),
      candidate: aiCandidate.optional(),
    })
    .strict(),
]);

export type AiInterpretationOutput = z.infer<typeof aiInterpretationSchema>;
