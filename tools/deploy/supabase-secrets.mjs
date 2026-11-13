// CR-010: refuse to deploy /api while a secret it needs is unset. Names only; values never printed.
import { spawnSync } from "node:child_process";

/** Set by Mabrur with `supabase secrets set`. SUPABASE_URL, keys and DB URL are built in. */
export const REQUIRED_SECRETS = ["CRON_SECRET", "ALLOWED_ORIGINS", "DEEPSEEK_API_KEY", "OWNER_EMAIL"];

export function missingSecrets(names) {
  const have = new Set(names);
  return REQUIRED_SECRETS.filter((n) => !have.has(n));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = spawnSync("pnpm", ["dlx", "supabase@2.122.0", "secrets", "list", "--output", "json"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("Could not list Supabase secrets. Run `pnpm dlx supabase@2.122.0 link --project-ref <ref>` first.");
    process.exit(1);
  }
  const names = JSON.parse(r.stdout).map((s) => s.name);
  const missing = missingSecrets(names);
  if (missing.length > 0) {
    console.error(`Missing Supabase secrets: ${missing.join(", ")}. Set them with \`pnpm dlx supabase@2.122.0 secrets set NAME=...\`.`);
    process.exit(1);
  }
  console.log("Supabase secrets: all set");
}
