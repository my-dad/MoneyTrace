import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppCheckSiteKey, resolveFirebaseConfig } from "./firebase-config";

const REAL = {
  apiKey: "AIza-real",
  authDomain: "moneytrace-staging.firebaseapp.com",
  projectId: "moneytrace-staging",
  storageBucket: "moneytrace-staging.firebasestorage.app",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
};

describe("resolveFirebaseConfig", () => {
  it("uses the configured values in a real build", () => {
    expect(resolveFirebaseConfig({ ...REAL })).toEqual(REAL);
  });

  it("refuses a real build with missing config instead of falling back to the demo project", () => {
    expect(() => resolveFirebaseConfig({ ...REAL, projectId: undefined })).toThrow("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    expect(() => resolveFirebaseConfig({})).toThrow("Missing Firebase config");
  });

  it("fills demo values only for emulator and fixture builds", () => {
    expect(resolveFirebaseConfig({ useEmulators: "1" }).projectId).toBe("demo-moneytrace");
    expect(resolveFirebaseConfig({ dataSource: "fixture" }).apiKey).toBe("demo-api-key");
  });

  it("reads each variable with a literal access Next.js can inline", () => {
    // Next.js replaces only `process.env.NEXT_PUBLIC_X`; a computed lookup by name stays empty in the browser.
    const source = readFileSync(join(import.meta.dirname, "firebase-config.ts"), "utf8");
    expect(source).not.toMatch(/process\.env\[/);
    for (const name of ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"]) {
      expect(source).toContain(`process.env.NEXT_PUBLIC_FIREBASE_${name}`);
    }
  });
});

describe("resolveAppCheckSiteKey (release blocker A3)", () => {
  it("a real build must carry the App Check site key", () => {
    expect(resolveAppCheckSiteKey({ appCheckSiteKey: "6Lc-site" })).toBe("6Lc-site");
    expect(() => resolveAppCheckSiteKey({})).toThrow("NEXT_PUBLIC_APPCHECK_SITE_KEY");
  });

  it("emulator and fixture builds run without App Check", () => {
    expect(resolveAppCheckSiteKey({ useEmulators: "1" })).toBeNull();
    expect(resolveAppCheckSiteKey({ dataSource: "fixture" })).toBeNull();
  });

  it("is read with a literal access", () => {
    expect(readFileSync(join(import.meta.dirname, "firebase-config.ts"), "utf8")).toContain("process.env.NEXT_PUBLIC_APPCHECK_SITE_KEY");
  });
});

describe("firebase.ts", () => {
  it("starts App Check with reCAPTCHA Enterprise when a site key is configured", () => {
    const source = readFileSync(join(import.meta.dirname, "firebase.ts"), "utf8");
    expect(source).toContain("resolveAppCheckSiteKey(readFirebaseEnv())");
    expect(source).toContain("new ReCaptchaEnterpriseProvider(");
    expect(source).toContain("isTokenAutoRefreshEnabled: true");
  });

  it("takes its config from firebase-config", () => {
    const source = readFileSync(join(import.meta.dirname, "firebase.ts"), "utf8");
    expect(source).not.toMatch(/process\.env\[/);
    expect(source).toContain("resolveFirebaseConfig(readFirebaseEnv())");
  });
});
