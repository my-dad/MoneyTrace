import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBundle, findSecrets } from "../scripts/check-bundle-secrets.mjs";

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2lnbmF0dXJlc2lnbmF0dXJl`;

describe("no secret ships in the web bundle", () => {
  it("allows the public anon key", () => {
    expect(findSecrets(`const k="${jwt({ iss: "supabase", role: "anon" })}"`)).toEqual([]);
  });

  it("finds a service_role key, which would give anyone the whole database", () => {
    expect(findSecrets(`k="${jwt({ iss: "supabase", role: "service_role" })}"`)).toEqual(["Supabase key with role service_role"]);
  });

  it("finds Supabase secret keys, DeepSeek keys, the backup key and database passwords", () => {
    expect(findSecrets('a="sb_secret_abcDEF1234567890abcd"')).toEqual(["Supabase secret key"]);
    expect(findSecrets('a="sk-0123456789abcdef0123456789abcdef"')).toEqual(["API secret key (sk-…)"]);
    expect(findSecrets("AGE-SECRET-KEY-1QQQQQQQQQQQQQQQQ")).toEqual(["backup private key"]);
    expect(findSecrets('"postgresql://postgres:hunter22secret@db.x.supabase.co:5432/postgres"')).toEqual(["database URL with a password"]);
    expect(findSecrets("-----BEGIN PRIVATE KEY-----")).toEqual(["private key"]);
  });

  it("checks every built file and names the file, never the secret itself", () => {
    const out = mkdtempSync(join(tmpdir(), "bundle-"));
    mkdirSync(join(out, "_next"));
    writeFileSync(join(out, "index.html"), "<p>fine</p>");
    writeFileSync(join(out, "_next", "chunk.js"), 'x="sk-0123456789abcdef0123456789abcdef"');
    expect(() => checkBundle(out)).toThrow(/_next\/chunk\.js: API secret key/);
    expect(() => checkBundle(out)).not.toThrow(/0123456789abcdef/);
  });

  it("passes a clean build", () => {
    const out = mkdtempSync(join(tmpdir(), "bundle-"));
    writeFileSync(join(out, "index.html"), `<script>k="${jwt({ role: "anon" })}"</script>`);
    expect(checkBundle(out)).toBe(1);
  });
});
