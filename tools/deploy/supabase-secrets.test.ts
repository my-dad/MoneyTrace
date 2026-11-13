import { describe, expect, it } from "vitest";
import { REQUIRED_ENV } from "../../apps/functions/src/supabase-entry";
import { REQUIRED_SECRETS, missingSecrets } from "./supabase-secrets.mjs";

const BUILT_IN = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"];

describe("deploy secrets check (CR-010)", () => {
  it("names every variable /api refuses to start without, except Supabase's built-ins", () => {
    for (const name of REQUIRED_ENV) expect(BUILT_IN.includes(name) || REQUIRED_SECRETS.includes(name), name).toBe(true);
  });

  it("lists what's missing", () => {
    expect(missingSecrets(["CRON_SECRET", "DEEPSEEK_API_KEY"])).toEqual(["ALLOWED_ORIGINS", "OWNER_EMAIL"]);
    expect(missingSecrets([...REQUIRED_SECRETS])).toEqual([]);
  });
});
