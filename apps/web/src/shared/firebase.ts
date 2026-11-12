import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { readFirebaseEnv, resolveAppCheckSiteKey, resolveFirebaseConfig } from "./firebase-config";

const app = getApps().length > 0 ? getApp() : initializeApp(resolveFirebaseConfig(readFirebaseEnv()));

// Deployed functions enforce App Check, so it starts before any call can be made.
const appCheckSiteKey = resolveAppCheckSiteKey(readFirebaseEnv());
if (appCheckSiteKey !== null && typeof window !== "undefined") {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south2");

if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
