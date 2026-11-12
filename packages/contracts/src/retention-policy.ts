import { z } from "zod";

const positiveInt = z.number().int().positive();

export const retentionPolicySchema = z
  .object({
    version: positiveInt,
    /** Ceiling for abandoned files. Normal deletion happens as soon as evidence is persisted. */
    temporaryUploadMaxHours: positiveInt,
    providerResultDays: positiveInt,
    conversationDays: positiveInt,
    /** Cloud Logging only. Never applies to accounting records. */
    operationalLogDays: positiveInt,
    /** Managed Firestore backups. Firestore keeps scheduled backups for at most 14 weeks. */
    backupDays: positiveInt.max(98),
  })
  .strict();

export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  version: 1,
  temporaryUploadMaxHours: 24,
  providerResultDays: 30,
  conversationDays: 365,
  operationalLogDays: 30,
  backupDays: 14,
};
