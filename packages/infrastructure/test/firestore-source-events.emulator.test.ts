import {
  commitWith,
  describeSourceEventContract,
  followUpOutput,
} from "@moneytrace/application/testing";
import { runStage } from "@moneytrace/application";
import { CapturingLogger } from "@moneytrace/application/testing";
import { OWNER_COLLECTIONS, type OwnerCollectionName } from "@moneytrace/contracts";
import { asOwnerId, asSourceEventId } from "@moneytrace/domain";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreSourceEventRepository } from "../src/firestore/firestore-source-event-repository";
import { ownerPath } from "../src/firestore/paths";

const PROJECT_ID = "demo-moneytrace";
const host = process.env["FIRESTORE_EMULATOR_HOST"];
if (host === undefined) throw new Error("run through `firebase emulators:exec`");
const emulatorHost: string = host;

// Skip the GCE metadata probe: it only produces a timeout warning against the emulator.
process.env["METADATA_SERVER_DETECTION"] = "none";

const db: Firestore = getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID }));
/** Contended Firestore transactions retry with a 1s-and-growing backoff, so they are slow by design. */
const CONTENTION_TIMEOUT_MS = 120_000;
const logger = new CapturingLogger();
const clock = { nowMs: () => 1_700_000_001_000 };

async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`could not clear the emulator: ${String(res.status)}`);
}

async function readCollection(
  ownerId: string,
  collection: OwnerCollectionName,
): Promise<Record<string, unknown>[]> {
  const snap = await db.collection(ownerPath(ownerId, collection)).get();
  return snap.docs.map((d) => d.data());
}

async function makeHarness() {
  await clearFirestore();
  return {
    repo: new FirestoreSourceEventRepository(db, clock, logger),
    outputsOf: readCollection,
  };
}

describeSourceEventContract("firestore", makeHarness);

const ownerId = asOwnerId("alice");
const sourceEventId = asSourceEventId("evt-par");

describe("firestore source event repository", () => {
  it(
    "ten parallel workers: one runs the work and one follow-up exists",
    async () => {
      const { repo } = await makeHarness();
      await repo.create(ownerId, {
        sourceEventId,
        sourceType: "sms",
        sourceHash: "h",
        idempotencyKey: "k",
        receivedAtMs: clock.nowMs(),
      });
      // Walk the event to the status the match stage consumes.
      for (const [stage, next] of [
        ["normalize", "normalized"],
        ["interpret", "interpreted"],
      ] as const) {
        const c = await repo.claim(ownerId, sourceEventId, stage, "setup", clock.nowMs());
        if (c.status !== "claimed") throw new Error("setup claim failed");
        await repo.commitStage(ownerId, c.claim, commitWith(null, next));
      }

      const deps = { sourceEvents: repo, clock, logger };
      let invocations = 0;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          runStage(deps, {
            ownerId,
            sourceEventId,
            stage: "match",
            workerId: `w${String(i)}`,
            work: () => {
              invocations += 1;
              return Promise.resolve(commitWith(followUpOutput("evt-par", "match"), "matched"));
            },
          }),
        ),
      );
      expect(invocations).toBe(1);
      expect(results.filter((r) => r.status === "completed")).toHaveLength(1);
      expect(results.filter((r) => r.status === "skipped")).toHaveLength(9);
      expect(await readCollection(ownerId, "followUps")).toHaveLength(1);
    },
    CONTENTION_TIMEOUT_MS,
  );

  it("every stored document validates against its contract schema", async () => {
    const { repo } = await makeHarness();
    await repo.create(ownerId, {
      sourceEventId,
      sourceType: "sms",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: clock.nowMs(),
    });
    const c = await repo.claim(ownerId, sourceEventId, "normalize", "w1", clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    await repo.commitStage(ownerId, c.claim, commitWith(followUpOutput("evt-par")));
    const c2 = await repo.claim(ownerId, sourceEventId, "interpret", "w1", clock.nowMs());
    if (c2.status !== "claimed") throw new Error("claim failed");
    await repo.park(
      ownerId,
      sourceEventId,
      c2.claim.version,
      { status: "pending", reason: "awaitingClarification" },
      clock.nowMs() + 1_000_000,
    );
    const names: OwnerCollectionName[] = ["sourceEvents", "idempotencyRecords", "followUps"];
    for (const name of names) {
      const docs = await readCollection(ownerId, name);
      expect(docs.length).toBeGreaterThan(0);
      for (const d of docs) expect(() => OWNER_COLLECTIONS[name].parse(d)).not.toThrow();
    }
    expect(await readCollection(ownerId, "idempotencyRecords")).toHaveLength(2);
  });

  it("an event with no claim is written with claim null, never undefined", async () => {
    const { repo } = await makeHarness();
    await repo.create(ownerId, {
      sourceEventId,
      sourceType: "chat",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: clock.nowMs(),
    });
    const snap = await db.doc(ownerPath(ownerId, "sourceEvents", sourceEventId)).get();
    expect(snap.data()).toMatchObject({ claim: null, parkedStage: null, terminalAtMs: null });
  });

  it("one malformed event does not stop recovery: it is skipped and logged", async () => {
    const { repo } = await makeHarness();
    logger.events.length = 0;
    await repo.create(ownerId, {
      sourceEventId,
      sourceType: "sms",
      sourceHash: "h",
      idempotencyKey: "k",
      receivedAtMs: clock.nowMs(),
    });
    const c = await repo.claim(ownerId, sourceEventId, "normalize", "w1", clock.nowMs());
    if (c.status !== "claimed") throw new Error("claim failed");
    // Expired lease, but not a valid event document.
    await db
      .doc(ownerPath(ownerId, "sourceEvents", "evt-bad"))
      .set({ id: "evt-bad", claim: { leaseExpiresAtMs: 1 } });
    const rows = await repo.listExpiredClaims(clock.nowMs() + 1_000_000, 10);
    expect(rows.map((r) => r.sourceEventId)).toEqual([sourceEventId]);
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]).toMatchObject({
      level: "warn",
      event: "pipeline.malformedSourceEvent",
    });
    expect(logger.events[0]?.fields["sourceEventId"]).toBe("evt-bad");
  });
});
