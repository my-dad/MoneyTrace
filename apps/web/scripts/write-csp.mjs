// Runs after `next build`: adds a Content-Security-Policy to the static export's `_headers`.
// Next puts a few small inline scripts in every page, and they change with each build, so the
// policy allows exactly those by hash instead of allowing all inline script. An injected script
// (from SMS text or an AI reply that slipped past React's escaping) can't run, and nothing can
// send data anywhere except our own site and our own Supabase project.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** `'sha256-…'` for each inline `<script>` (one without `src`), in page order. */
export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.push(`'sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
  }
  return hashes;
}

/** The policy. `supabaseUrl` is absent in demo builds, which talk to nothing but our site. */
export function buildCsp({ hashes, supabaseUrl }) {
  const connect = ["'self'"];
  if (supabaseUrl) {
    const origin = new URL(supabaseUrl).origin;
    connect.push(origin, origin.replace(/^http/, "ws"));
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    // React sets `style` props through the DOM, which the policy allows anyway; Next may also
    // inline a little CSS. Styles can't run code, so we don't hash them.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => join(e.parentPath, e.name));

/** Adds the policy to the `/*` block of `<outDir>/_headers`, covering every page's inline scripts. */
export function writeCsp(outDir, env) {
  const hashes = [...new Set(htmlFiles(outDir).sort().flatMap((f) => inlineScriptHashes(readFileSync(f, "utf8"))))];
  const csp = buildCsp({ hashes, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL });
  const lines = readFileSync(join(outDir, "_headers"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.trim() === "/*");
  if (start === -1) throw new Error("write-csp: _headers has no `/*` block to add the policy to");
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
  lines.splice(end, 0, `  Content-Security-Policy: ${csp}`);
  writeFileSync(join(outDir, "_headers"), lines.join("\n"));
  return { pages: htmlFiles(outDir).length, hashes: hashes.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = fileURLToPath(new URL("../out/", import.meta.url));
  const { pages, hashes } = writeCsp(out, process.env);
  console.log(`write-csp: policy covers ${String(hashes)} inline scripts across ${String(pages)} pages`);
}
