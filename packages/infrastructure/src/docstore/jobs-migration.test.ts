import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TRIGGERS } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(fileURLToPath(new URL("../../../../supabase/migrations/20261113000200_jobs.sql", import.meta.url)), "utf8");
const scheduled = new Map([...SQL.matchAll(/cron\.schedule\('(\w+)', '([^']+)'/g)].map((m) => [m[1], m[2]]));

/** The cron line each Firebase schedule string becomes. */
const CRON_FOR: Record<string, RegExp> = {
  "every 5 minutes": /^\*\/5 \* \* \* \*$/,
  "every 15 minutes": /^\*\/15 \* \* \* \*$/,
  hourly: /^\d{1,2} \* \* \* \*$/,
  daily: /^\d{1,2} \d{1,2} \* \* \*$/,
};

describe("scheduled jobs migration (replaces Cloud Scheduler)", () => {
  it("schedules every phase-1 contract job at its contract cadence", () => {
    // Phase-2 jobs (receipt uploads, deferred by CR-001) are not deployed on either backend.
    const jobs = Object.entries(TRIGGERS).filter(([, t]) => t.kind === "schedule" && t.phase === 1);
    expect(jobs.length).toBeGreaterThan(0);
    for (const [name, t] of jobs) {
      const cron = scheduled.get(name);
      expect(cron, name).toBeDefined();
      expect(cron, name).toMatch(CRON_FOR[t.source] ?? /^never$/);
    }
  });

  it("sweeps the pipeline every minute, in place of the source-event trigger", () => {
    expect(scheduled.get("advancePending")).toBe("* * * * *");
  });

  it("keeps the secret out of the migration and the job function private", () => {
    expect(SQL).toMatch(/vault\.decrypted_secrets where name = 'cron_secret'/);
    expect(SQL).toMatch(/revoke all on function public\.run_api_job\(text\) from public, anon, authenticated/);
  });
});
