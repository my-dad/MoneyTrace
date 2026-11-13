import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { readFirebaseEnv, resolveAppCheckSiteKey, resolveFirebaseConfig } from "./firebase-config";

type FirebaseServices = { auth: Auth; db: Firestore; functions: Functions };
let services: FirebaseServices | undefined;

/**
 * Started on first use (CR-010): Supabase builds never touch Firebase. Kept for the emulator
 * end-to-end suite until Firebase is removed (Phase 8).
 */
export function firebase(): FirebaseServices {
  if (services !== undefined) return services;
  const app = getApps().length > 0 ? getApp() : initializeApp(resolveFirebaseConfig(readFirebaseEnv()));
  // Deployed functions enforce App Check, so it starts before any call can be made.
  const appCheckSiteKey = resolveAppCheckSiteKey(readFirebaseEnv());
  if (appCheckSiteKey !== null && typeof window !== "undefined") {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  services = { auth: getAuth(app), db: getFirestore(app), functions: getFunctions(app, "asia-south2") };
  if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
    connectAuthEmulator(services.auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(services.db, "127.0.0.1", 8080);
    connectFunctionsEmulator(services.functions, "127.0.0.1", 5001);
  }
  return services;
}

export const firebaseInvoke = async (name: string, request: unknown): Promise<unknown> =>
  (await httpsCallable(firebase().functions, name)(request)).data;
