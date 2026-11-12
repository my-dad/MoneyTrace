import { fileURLToPath } from "node:url";
import { DEFAULT_RETENTION_POLICY, retentionPolicySchema } from "@moneytrace/contracts";

/**
 * The `--retention` value for the Firestore backup schedule. It comes from the retention
 * policy, and BACKUP_RETENTION_DAYS overrides it within the same limits.
 */
export function backupRetention(env: Record<string, string | undefined>): string {
  const override = env["BACKUP_RETENTION_DAYS"];
  if (override === undefined) return `${String(DEFAULT_RETENTION_POLICY.backupDays)}d`;
  const days = /^\d+$/.test(override) ? Number(override) : Number.NaN;
  const parsed = retentionPolicySchema.safeParse({ ...DEFAULT_RETENTION_POLICY, backupDays: days });
  if (!parsed.success) throw new Error(`BACKUP_RETENTION_DAYS must be a whole number of days from 1 to 98, got "${override}"`);
  return `${String(parsed.data.backupDays)}d`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(backupRetention(process.env));
}
