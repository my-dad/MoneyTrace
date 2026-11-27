import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, inlineScriptHashes, writeCsp } from "../scripts/write-csp.mjs";

const sha = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const directives = (csp: string): Record<string, string[]> =>
  Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .map(([name, ...values]): [string, string[]] => [name ?? "", values]),
  );

describe("Content-Security-Policy for the static export", () => {
  it("hashes only inline scripts, byte for byte", () => {
    const html = `<script src="/_next/a.js" async=""></script><script>self.x=1</script><script id="_R_">push("é")</script>`;
    expect(inlineScriptHashes(html)).toEqual([sha("self.x=1"), sha('push("é")')]);
  });

  it("allows scripts only from our origin and the hashed inline ones; no eval, plugins or framing", () => {
    const d = directives(buildCsp({ hashes: ["'sha256-abc'"], supabaseUrl: undefined }));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(["'self'", "'sha256-abc'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(Object.values(d).flat()).not.toContain("'unsafe-eval'");
  });

  it("lets the app talk to its own Supabase project only, over HTTPS and secure websockets", () => {
    const d = directives(buildCsp({ hashes: [], supabaseUrl: "https://abc.supabase.co/" }));
    expect(d["connect-src"]).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
  });

  it("uses plain websockets for a local Supabase", () => {
    const d = directives(buildCsp({ hashes: [], supabaseUrl: "http://127.0.0.1:54321" }));
    expect(d["connect-src"]).toEqual(["'self'", "http://127.0.0.1:54321", "ws://127.0.0.1:54321"]);
  });

  it("shows Google profile photos and nothing else from outside", () => {
    const d = directives(buildCsp({ hashes: [], supabaseUrl: undefined }));
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:", "https://*.googleusercontent.com"]);
  });

  it("writes one policy into the build's `/*` header block, covering every page's inline scripts", () => {
    const out = mkdtempSync(join(tmpdir(), "csp-"));
    mkdirSync(join(out, "_not-found"));
    writeFileSync(join(out, "index.html"), "<script>a()</script>");
    writeFileSync(join(out, "_not-found", "index.html"), "<script>b()</script><script>a()</script>");
    writeFileSync(join(out, "_headers"), "/*\n  X-Frame-Options: DENY\n\n/sw.js\n  Cache-Control: no-cache\n");

    writeCsp(out, { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" });

    const headers = readFileSync(join(out, "_headers"), "utf8");
    const line = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:")) ?? "";
    expect(headers.indexOf(line)).toBeLessThan(headers.indexOf("/sw.js"));
    const d = directives(line.slice(line.indexOf(":") + 1));
    expect(d["script-src"]?.[0]).toBe("'self'");
    expect(d["script-src"]?.slice(1).sort()).toEqual([sha("a()"), sha("b()")].sort());
    expect(d["connect-src"]).toContain("https://abc.supabase.co");
    expect(headers.match(/Content-Security-Policy:/g)).toHaveLength(1);
  });

  it("refuses to finish a build whose headers have no `/*` block", () => {
    const out = mkdtempSync(join(tmpdir(), "csp-"));
    writeFileSync(join(out, "index.html"), "");
    writeFileSync(join(out, "_headers"), "/sw.js\n  Cache-Control: no-cache\n");
    expect(() => writeCsp(out, {})).toThrow(/\/\*/);
  });
});
