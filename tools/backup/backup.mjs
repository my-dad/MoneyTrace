// CR-010 backups. Encrypt in CI with the public key; decrypt and check only with the private key,
// which never leaves Mabrur's machine. Usage:
//   node tools/backup/backup.mjs keygen <private-key-file>            → prints the public key
//   node tools/backup/backup.mjs encrypt <public-key> <in> <out.age>
//   node tools/backup/backup.mjs drill <docs.sql.age> <private-key-file> <manifest.json.age>
//   node tools/backup/backup.mjs decrypt <in.age> <private-key-file> <out>   → for a real restore
import { readFileSync, writeFileSync } from "node:fs";
import { Decrypter, Encrypter, generateIdentity, identityToRecipient } from "age-encryption";

export async function keygen() {
  const identity = await generateIdentity();
  return { identity, recipient: await identityToRecipient(identity) };
}

export async function encrypt(recipient, bytes) {
  const e = new Encrypter();
  e.addRecipient(recipient);
  return e.encrypt(bytes);
}

export async function decrypt(identity, bytes) {
  const d = new Decrypter();
  d.addIdentity(identity);
  return d.decrypt(bytes, "text");
}

/**
 * Restores a data-only dump of `public.docs` into a fresh in-process Postgres with the real
 * migration, then checks: row counts per collection match the manifest taken at dump time, and the
 * ledger check finds no problem. Returns the report; `ok` is the verdict.
 */
export async function drill(dumpSql, manifest) {
  const { PGlite } = await import("@electric-sql/pglite");
  const root = new URL("../../", import.meta.url);
  const db = new PGlite();
  await db.exec(readFileSync(new URL("supabase/migrations/20261113000000_docs.sql", root), "utf8"));
  await db.exec(dumpSql);
  // pg_dump clears search_path at the top of every dump.
  await db.exec("set search_path to public");
  const counts = Object.fromEntries(
    (await db.query("select collection_id, count(*)::int as n from docs group by collection_id")).rows.map((r) => [r.collection_id, r.n]),
  );
  const problems = (await db.query(readFileSync(new URL("tools/backup/ledger-check.sql", root), "utf8"))).rows;
  const missing = Object.entries(manifest).filter(([c, n]) => (counts[c] ?? 0) !== n).map(([c, n]) => `${c}: dump ${String(n)}, restored ${String(counts[c] ?? 0)}`);
  const extra = Object.keys(counts).filter((c) => !(c in manifest)).map((c) => `${c}: not in the manifest`);
  await db.close();
  const mismatches = [...missing, ...extra];
  return { ok: mismatches.length === 0 && problems.length === 0, counts, mismatches, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "keygen") {
    const { identity, recipient } = await keygen();
    writeFileSync(args[0], `${identity}\n`, { mode: 0o600, flag: "wx" });
    console.log(recipient);
  } else if (cmd === "encrypt") {
    writeFileSync(args[2], await encrypt(args[0].trim(), readFileSync(args[1])));
  } else if (cmd === "decrypt") {
    const key = readFileSync(args[1], "utf8").trim();
    writeFileSync(args[2], await decrypt(key, readFileSync(args[0])), { mode: 0o600, flag: "wx" });
  } else if (cmd === "drill") {
    const key = readFileSync(args[1], "utf8").trim();
    const sql = await decrypt(key, readFileSync(args[0]));
    const report = await drill(sql, JSON.parse(await decrypt(key, readFileSync(args[2]))));
    console.log(JSON.stringify(report, null, 2));
    console.log(report.ok ? "restore drill: PASS" : "restore drill: FAIL");
    process.exit(report.ok ? 0 : 1);
  } else {
    console.error("usage: keygen <file> | encrypt <public-key> <in> <out> | drill <docs.sql.age> <key-file> <manifest.json.age> | decrypt <in.age> <key-file> <out>");
    process.exit(2);
  }
}
