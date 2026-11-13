import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Hosting = {
  redirects: { source: string; destination: string; type: number }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const hosting = (JSON.parse(readFileSync(join(import.meta.dirname, "../../../firebase.json"), "utf8")) as { hosting: Hosting }).hosting;
const pub = (name: string) => readFileSync(join(import.meta.dirname, "../public", name), "utf8");
const lines = (text: string) => text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));

describe("Cloudflare Pages config matches Firebase Hosting (CR-010)", () => {
  it("redirects every old screen to the dashboard", () => {
    const rules = lines(pub("_redirects")).map((l) => l.trim().split(/\s+/));
    expect(rules).toEqual(hosting.redirects.map((r) => [r.source, r.destination, String(r.type)]));
  });

  it("sends the same security and cache headers", () => {
    const text = pub("_headers");
    for (const block of hosting.headers) {
      const path = block.source === "**" ? "/*" : block.source.replace("/**", "/*");
      const section = text.split(/\n(?=\/)/).find((s) => s.trimStart().startsWith(`${path}\n`));
      expect(section, path).toBeDefined();
      for (const h of block.headers) expect(section, `${path} ${h.key}`).toContain(`  ${h.key}: ${h.value}`);
    }
  });
});
