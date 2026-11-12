import type { FirebaseOptions } from "firebase/app";

export type FirebaseEnv = {
  apiKey?: string | undefined;
  authDomain?: string | undefined;
  projectId?: string | undefined;
  storageBucket?: string | undefined;
  messagingSenderId?: string | undefined;
  appId?: string | undefined;
  useEmulators?: string | undefined;
  dataSource?: string | undefined;
  appCheckSiteKey?: string | undefined;
};

/**
 * Each variable is read with a literal `process.env.NEXT_PUBLIC_*` access, because Next.js inlines
 * only those into the browser bundle. A computed lookup by name is always empty there.
 */
export function readFirebaseEnv(): FirebaseEnv {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    useEmulators: process.env.NEXT_PUBLIC_USE_EMULATORS,
    dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE,
    appCheckSiteKey: process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY,
  };
}

const FIELDS = [
  ["apiKey", "NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key"],
  ["authDomain", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo-moneytrace.local"],
  ["projectId", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-moneytrace"],
  ["storageBucket", "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "demo-moneytrace.local"],
  ["messagingSenderId", "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "000000000000"],
  ["appId", "NEXT_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:demo"],
] as const;

/** Demo values fill gaps only in emulator and fixture builds; a real build must be fully configured. */
export function resolveFirebaseConfig(env: FirebaseEnv): FirebaseOptions {
  const local = env.useEmulators === "1" || env.dataSource === "fixture";
  const missing = FIELDS.filter(([key]) => (env[key] ?? "") === "").map(([, name]) => name);
  if (!local && missing.length > 0) throw new Error(`Missing Firebase config: ${missing.join(", ")}`);
  return Object.fromEntries(FIELDS.map(([key, , demo]) => [key, (env[key] ?? "") === "" ? demo : env[key]]));
}

/**
 * The reCAPTCHA Enterprise site key App Check uses (release blocker A3). Deployed functions refuse
 * calls without an App Check token, so a real build without the key fails here, not at runtime.
 */
export function resolveAppCheckSiteKey(env: FirebaseEnv): string | null {
  if (env.useEmulators === "1" || env.dataSource === "fixture") return null;
  const key = env.appCheckSiteKey ?? "";
  if (key === "") throw new Error("Missing App Check config: NEXT_PUBLIC_APPCHECK_SITE_KEY");
  return key;
}
