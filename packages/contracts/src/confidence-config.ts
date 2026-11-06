import { z } from "zod";

export const confidenceConfigSchema = z
  .object({
    version: z.number().int().positive(),
    aiAutoPostThresholdBp: z.number().int().min(0).max(10001),
  })
  .strict();

export type ConfidenceConfig = z.infer<typeof confidenceConfigSchema>;

/** 10001 is above the maximum score, so AI cannot auto-post until Phase 1 tunes it against fixtures. */
export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  version: 1,
  aiAutoPostThresholdBp: 10001,
};
