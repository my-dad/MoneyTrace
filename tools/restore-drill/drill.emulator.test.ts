/** @vitest-environment node */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseOptions, seed, verify } from "./drill";

const PROJECT_ID = "demo-moneytrace";
const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
let dir = "";

async function clear(): Promise<void> {
  const host = process.env["FIRESTORE_EMULATOR_HOST"];
  if (host === undefined) throw new Error("run through `firebase emulators:exec`");
  const response = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`could not clear emulator: ${String(response.status)}`);
}

const options = (command: "seed" | "verify") =>
  parseOptions(["node", "drill.ts", command, "--expected", join(dir, "expected.json")], process.env);

beforeEach(async () => {
  await clear();
  dir = await mkdtemp(join(tmpdir(), "drill-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("restore drill seed and verify", { timeout: 60_000 }, () => {
  it("matches straight after seeding", async () => {
    await seed(options("seed"));
    expect(await verify(options("verify"))).toEqual([]);
  });

  it("reports a ledger entry lost in the restore, and the balance it no longer explains", async () => {
    await seed(options("seed"));
    const entries = await db.collection("users/restore-drill/ledgerEntries").limit(1).get();
    await entries.docs[0]?.ref.delete();
    const differences = await verify(options("verify"));
    expect(differences).toContain("ledgerEntries");
    expect(differences.some((d) => d.startsWith("balance:"))).toBe(true);
  });

  it("reports a balance that disagrees with its entries", async () => {
    await seed(options("seed"));
    await db.doc("users/restore-drill/balances/restore-bank").update({ debitMinusCreditMinor: 999 });
    expect(await verify(options("verify"))).toEqual(expect.arrayContaining(["balances", "balance:restore-bank"]));
  });

  it("seeds only terminal source events, so nothing deployed changes them before the backup", async () => {
    await seed(options("seed"));
    const events = await db.collection("users/restore-drill/sourceEvents").get();
    for (const event of events.docs) expect(event.get("terminalAtMs")).not.toBeNull();
  });
});
