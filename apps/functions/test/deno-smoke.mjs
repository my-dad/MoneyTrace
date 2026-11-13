// CR-010 smoke test: the built /api bundle under Deno with npm:postgres, against Postgres
// (PGlite behind a socket) with the real migration. Run: `pnpm smoke:supabase`.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const db = new PGlite();
await db.exec(readFileSync(join(root, "supabase/migrations/20261113000000_docs.sql"), "utf8"));
const port = 55_000 + Math.floor(Math.random() * 1000);
const server = new PGLiteSocketServer({ db, port });
await server.start();

const dir = mkdtempSync(join(tmpdir(), "mt-smoke-"));
const script = join(dir, "smoke.ts");
writeFileSync(script, `
import postgres from "npm:postgres@3.4.9";
import { startApi } from ${JSON.stringify(join(root, "supabase/functions/api/bundle.mjs"))};
const sql = postgres({ host: "127.0.0.1", port: ${port}, database: "postgres", username: "postgres", max: 1, prepare: false });
const pending: Promise<unknown>[] = [];
const handle = startApi({
  sql,
  env: { SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", CRON_SECRET: "smoke-secret-0123456789", ALLOWED_ORIGINS: "https://app.example", DEEPSEEK_API_KEY: "unused" },
  waitUntil: (p) => pending.push(p),
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const results: Record<string, number> = {};
results.noToken = (await post({ command: "bootstrapUser", data: {} })).status;
results.badCron = (await post({ job: "advancePending" }, { "x-cron-secret": "nope" })).status;
for (const job of ["advancePending", "recoverExpiredClaims", "dispatchFollowUps", "resumeQuotaBlockedEvents", "purgeProviderResults"]) {
  results[job] = (await post({ job }, { "x-cron-secret": "smoke-secret-0123456789" })).status;
}
results.preflight = (await handle(new Request("http://x/api", { method: "OPTIONS", headers: { origin: "https://app.example" } }))).status;
await Promise.all(pending);
await sql.end();
console.log("SMOKE " + JSON.stringify(results));
`);
// Async: the Postgres socket lives in this process, so blocking on the child would starve it.
const r = await new Promise((resolve) => {
  // CI installs Deno itself (DENO=deno); locally pnpm fetches the same version.
  const [cmd, ...pre] = process.env.DENO ? [process.env.DENO] : ["pnpm", "dlx", "deno@2.5.6"];
  const child = spawn(cmd, [...pre, "run", "--quiet", "--allow-net", "--allow-env", "--allow-read", "--allow-sys", script]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const timer = setTimeout(() => child.kill(), 240_000);
  child.on("close", () => {
    clearTimeout(timer);
    resolve({ stdout, stderr });
  });
});
await server.stop();
const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("SMOKE "));
if (line === undefined) {
  console.error(r.stdout, r.stderr);
  process.exit(1);
}
const got = JSON.parse(line.slice(6));
const want = { noToken: 401, badCron: 403, advancePending: 200, recoverExpiredClaims: 200, dispatchFollowUps: 200, resumeQuotaBlockedEvents: 200, purgeProviderResults: 200, preflight: 204 };
const ok = JSON.stringify(got) === JSON.stringify(want);
console.log(ok ? "deno smoke: PASS" : "deno smoke: FAIL", got);
process.exit(ok ? 0 : 1);
