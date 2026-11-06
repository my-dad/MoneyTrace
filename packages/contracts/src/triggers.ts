import type { ZodType } from "zod";
import { z } from "zod";
import { documentId } from "./primitives";

export interface TriggerContract {
  readonly kind: "firestore" | "schedule";
  readonly source: string;
  readonly phase: number;
  readonly input?: ZodType;
}

const sourceEventWrittenInput = z
  .object({ ownerId: documentId, sourceEventId: documentId })
  .strict();

export const TRIGGERS = {
  onSourceEventWritten: {
    kind: "firestore",
    source: "users/{uid}/sourceEvents/{id}",
    phase: 1,
    input: sourceEventWrittenInput,
  },
  recoverExpiredClaims: { kind: "schedule", source: "every 5 minutes", phase: 1 },
  dispatchFollowUps: { kind: "schedule", source: "every 15 minutes", phase: 1 },
  resumeQuotaBlockedEvents: { kind: "schedule", source: "hourly", phase: 1 },
  sweepAbandonedUploads: { kind: "schedule", source: "hourly", phase: 2 },
  purgeProviderResults: { kind: "schedule", source: "daily", phase: 1 },
} as const satisfies Record<string, TriggerContract>;

export type TriggerName = keyof typeof TRIGGERS;
