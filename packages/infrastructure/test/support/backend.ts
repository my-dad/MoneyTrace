import type { DocStore } from "../../src/docstore/doc-store";
import { pgliteStore } from "./pglite";

const PROJECT_ID = "demo-moneytrace";

export type TestBackend = {
  name: "postgres" | "firestore";
  db: DocStore;
  clear: () => Promise<void>;
};

/**
 * The store the adapter suites run on: Postgres (PGlite, in `pnpm test`) by default, or the
 * Firestore emulator under `pnpm test:emulator`. One suite, two backends, same behaviour (CR-010).
 */
export async function testBackend(): Promise<TestBackend> {
  const host = process.env["FIRESTORE_EMULATOR_HOST"];
  if (host === undefined) {
    const { store, reset } = await pgliteStore();
    return { name: "postgres", db: store, clear: reset };
  }
  process.env["METADATA_SERVER_DETECTION"] = "none";
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { fromFirestore } = await import("../../src/docstore/from-firestore");
  const db = fromFirestore(getFirestore(getApps()[0] ?? initializeApp({ projectId: PROJECT_ID })));
  const clear = async () => {
    const res = await fetch(
      `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      {
        method: "DELETE",
      },
    );
    if (!res.ok) throw new Error(`could not clear the emulator: ${String(res.status)}`);
  };
  return { name: "firestore", db, clear };
}
