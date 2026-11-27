// Runs after `next build`: fails the build if a secret reached the static export. Everything in
// `out/` is public. The likeliest slip is pasting the service_role key into
// NEXT_PUBLIC_SUPABASE_ANON_KEY on Cloudflare, which would hand anyone every user's data.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/\bsk-[A-Za-z0-9]{20,}/, "API secret key (sk-…)"],
  [/AGE-SECRET-KEY-[A-Z0-9]{10,}/, "backup private key"],
  [/postgres(?:ql)?:\/\/[^\s:/"'@]+:[^\s@"']{6,}@/, "database URL with a password"],
  [/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, "private key"],
];

/** What kinds of secret `text` holds (never the values themselves). Supabase JWTs pass only with role anon. */
export function findSecrets(text) {
  const found = [];
  for (const [pattern, name] of PATTERNS) if (pattern.test(text)) found.push(name);
  for (const [, payload] of text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    let role;
    try {
      role = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role;
    } catch {
      continue;
    }
    if (role !== undefined && role !== "anon") found.push(`Supabase key with role ${String(role)}`);
  }
  return [...new Set(found)];
}

/** Throws, naming each file and kind of secret, if any built file holds one. Returns files checked. */
export function checkBundle(outDir) {
  const files = readdirSync(outDir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
  const problems = files.flatMap((f) => findSecrets(readFileSync(f, "utf8")).map((s) => `${relative(outDir, f)}: ${s}`));
  if (problems.length > 0) throw new Error(`check-bundle-secrets: secrets in the public build:\n${problems.join("\n")}`);
  return files.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = checkBundle(fileURLToPath(new URL("../out/", import.meta.url)));
  console.log(`check-bundle-secrets: ${String(count)} files, no secrets`);
}
