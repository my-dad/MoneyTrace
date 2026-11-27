import { z } from "zod";
import { nonNegativeMinorAmount } from "./primitives";
import { sectorSchema } from "./sectors";

/** The kinds of figure a tip can be about (spec: spending tips, §1). */
export const TIP_KINDS = ["sectorUp", "sectorDown", "topSector", "spentOverCameIn", "unsorted", "unexplainedCash"] as const;
export type TipKind = (typeof TIP_KINDS)[number];

/** At most this many tips at once. */
export const MAX_TIPS = 3;
/** "New tips" presses allowed per Dhaka day; every attempt counts. */
export const FORCED_TIPS_PER_DAY = 3;
/** The longest advice kept. */
export const TIP_ADVICE_MAX = 200;

/** One figure worth a tip, worked out and worded by our code; the AI never writes these. */
export const tipFactSchema = z
  .object({
    /** Stable while the fact holds: `sectorUp:food`, `unsorted`. */
    id: z.string().regex(/^[A-Za-z]+(:[a-z]+)?$/).max(64),
    kind: z.enum(TIP_KINDS),
    sector: sectorSchema.optional(),
    amountMinor: nonNegativeMinorAmount,
    /** What it is compared with: last month's figure, all spending, or what came in. */
    compareMinor: nonNegativeMinorAmount.optional(),
    headline: z.string().min(1).max(120),
    detail: z.string().min(1).max(200),
  })
  .strict();
export type TipFact = z.output<typeof tipFactSchema>;

/**
 * DeepSeek's reply, checked for shape only. What the advice may say is ruled by our validator,
 * so a long or numeric advice parses here and is dropped there.
 */
export const tipsReplySchema = z.object({
  tips: z.array(z.object({ factId: z.string().max(64), advice: z.string().max(1000) })).max(10),
});
export type TipsReply = z.output<typeof tipsReplySchema>;
