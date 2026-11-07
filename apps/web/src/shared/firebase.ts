import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const env = (name: string, fallback: string): string => process.env[name] ?? fallback;

const app = getApps().length > 0
  ? getApp()
  : initializeApp({
      apiKey: env("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key"),
      authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo-moneytrace.local"),
      projectId: env("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-moneytrace"),
      storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "demo-moneytrace.local"),
      messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "000000000000"),
      appId: env("NEXT_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:demo"),
    });

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-south2");

if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
