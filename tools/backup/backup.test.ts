import { asAccountId, asOwnerId, Money } from "@moneytrace/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { composeDeps } from "../../apps/functions/src/composition";
import { pgliteStore } from "../../packages/infrastructure/test/support/pglite";
import { decrypt, drill as run, encrypt, keygen } from "./backup.mjs";

const quote = (v: unknown) => (typeof v === "string" ? `'${v.replaceAll("'", "''")}'` : "NULL");
let dump = "";
let manifest: Record<string, number> = {};

/** A dump shaped like `pg_dump --data-only --inserts --table=public.docs`, from real seeded data. */
beforeAll(async () => {
  const { store, client } = await pgliteStore();
  const deps = composeDeps(store, { FUNCTIONS_EMULATOR: "true", MONEYTRACE_AI: "fake" });
  const owner = asOwnerId("alice");
  await deps.bootstrapUser.execute({ ownerId: owner });
  const { accountId } = await deps.createAccount.execute({ ownerId: owner, kind: "bank", name: "BRAC", currency: "BDT" } as never);
  await deps.recordOpeningBalance.execute({ ownerId: owner, accountId: asAccountId(accountId), amount: Money.ofMinor(10_000_000, "BDT"), effectiveAtMs: Date.UTC(2026, 0, 1), actor: owner });
  const rows = (await client.query("select path, parent, collection_id, owner_id, data::text as data, updated_at::text as updated_at from docs order by path", [])).rows as unknown as Record<string, unknown>[];
  dump = [
    "SET statement_timeout = 0;",
    "SELECT pg_catalog.set_config('search_path', '', false);",
    ...rows.map((r) => `INSERT INTO public.docs VALUES (${[r["path"], r["parent"], r["collection_id"], r["owner_id"], r["data"], r["updated_at"]].map(quote).join(", ")});`),
  ].join("\n");
  manifest = {};
  for (const r of rows) manifest[r["collection_id"] as string] = (manifest[r["collection_id"] as string] ?? 0) + 1;
});

describe("encrypted backups and the restore drill (CR-010)", () => {
  it("round-trips through age with the key pair, and a wrong key can't read it", async () => {
    const { identity, recipient } = await keygen();
    expect(recipient).toMatch(/^age1/);
    const sealed = await encrypt(recipient, new TextEncoder().encode(dump));
    expect(new TextDecoder().decode(sealed)).not.toContain("alice");
    expect(await decrypt(identity, sealed)).toBe(dump);
    const other = await keygen();
    await expect(decrypt(other.identity, sealed)).rejects.toThrow();
  });

  it("a faithful restore matches the manifest and every transaction balances", async () => {
    const report = await run(dump, manifest);
    expect(report.problems).toEqual([]);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts["ledgerEntries"]).toBeGreaterThan(0);
  });

  it("catches a lost row", async () => {
    const lines = dump.split("\n");
    const cut = lines.findIndex((l) => l.includes("/ledgerEntries/"));
    const report = await run([...lines.slice(0, cut), ...lines.slice(cut + 1)].join("\n"), manifest);
    expect(report.ok).toBe(false);
    expect(report.mismatches.join()).toContain("ledgerEntries");
    expect(report.problems.map((p) => p.problem)).toContain("unbalanced transaction");
  });

  it("catches a balance that no longer matches its entries", async () => {
    const tampered = dump.replace(/("debitMinusCreditMinor": ?)(-?\d+)/, (_m, k: string, n: string) => `${k}${String(Number(n) + 1)}`);
    expect(tampered).not.toBe(dump);
    const report = await run(tampered, manifest);
    expect(report.ok).toBe(false);
    expect(report.problems.map((p) => p.problem)).toContain("balance differs from entries");
  });
});
