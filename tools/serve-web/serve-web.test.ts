import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHeaders, parseRedirects, resolveFile } from "./serve-web.mjs";

describe("test web server (Cloudflare Pages rules)", () => {
  it("reads _redirects and _headers", () => {
    expect(parseRedirects("# c\n/chat  /  302\n")).toEqual([{ from: "/chat", to: "/", status: 302 }]);
    expect(parseHeaders("/*\n  X-Frame-Options: DENY\n/sw.js\n  Cache-Control: no-cache\n")).toEqual([
      { pattern: "/*", headers: { "X-Frame-Options": "DENY" } },
      { pattern: "/sw.js", headers: { "Cache-Control": "no-cache" } },
    ]);
  });

  it("serves clean URLs and never escapes the build folder", () => {
    const root = mkdtempSync(join(tmpdir(), "out-")) + "/";
    writeFileSync(join(root, "index.html"), "home");
    writeFileSync(join(root, "about.html"), "about");
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "index.html"), "docs");
    expect(resolveFile(root, "/")).toBe(join(root, "index.html"));
    expect(resolveFile(root, "/about")).toBe(join(root, "about.html"));
    expect(resolveFile(root, "/docs")).toBe(join(root, "docs", "index.html"));
    expect(resolveFile(root, "/../../etc/passwd")).toBeNull();
    expect(resolveFile(root, "/missing")).toBeNull();
  });
});
