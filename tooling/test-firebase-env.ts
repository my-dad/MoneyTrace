/**
 * Unit tests import the web app's Firebase module, which refuses to start without config.
 * They get an explicit demo-project config, as a configured build would; nothing connects.
 */
export const TEST_FIREBASE_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-moneytrace.local",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-moneytrace",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-moneytrace.local",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:demo",
  NEXT_PUBLIC_APPCHECK_SITE_KEY: "demo-site-key",
};
