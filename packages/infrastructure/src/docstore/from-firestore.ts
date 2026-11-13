import type { Firestore } from "firebase-admin/firestore";
import type { DocStore } from "./doc-store";

/**
 * Firestore already has every method `DocStore` names, with the same behaviour; only its richer
 * TypeScript types differ. Kept until Firebase is removed (CR-010, Phase 8).
 */
export const fromFirestore = (db: Firestore): DocStore => db as unknown as DocStore;
