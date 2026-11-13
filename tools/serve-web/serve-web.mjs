// Serves the static web build (apps/web/out) the way Cloudflare Pages does (CR-010): clean URLs,
// `_redirects` and `_headers`. For the browser tests only; production is Cloudflare itself.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../apps/web/out/", import.meta.url));
const PORT = Number(process.env.PORT ?? 5005);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain", ".woff2": "font/woff2" };

/** `_redirects` lines: `from to status`. */
export function parseRedirects(text) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")).map((l) => {
    const [from, to, status] = l.split(/\s+/);
    return { from, to, status: Number(status ?? 302) };
  });
}

/** `_headers` blocks: a path pattern line, then indented `Name: value` lines. `*` matches anything. */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const i = line.indexOf(":");
      rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

const matches = (pattern, path) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`).test(path);

/** The file a clean URL names: `/x` → `x.html` or `x/index.html`; `null` when none exists. */
export function resolveFile(root, urlPath) {
  const path = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
    const file = join(root, candidate);
    if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (name) => (existsSync(join(ROOT, name)) ? readFileSync(join(ROOT, name), "utf8") : "");
  const redirects = parseRedirects(read("_redirects"));
  const headerRules = parseHeaders(read("_headers"));
  createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const headers = Object.assign({}, ...headerRules.filter((r) => matches(r.pattern, path)).map((r) => r.headers));
    const redirect = redirects.find((r) => r.from === path);
    if (redirect !== undefined) {
      res.writeHead(redirect.status, { ...headers, location: redirect.to }).end();
      return;
    }
    const file = resolveFile(ROOT, path) ?? resolveFile(ROOT, "/404");
    if (file === null) {
      res.writeHead(404, headers).end("not found");
      return;
    }
    const status = file.endsWith("404.html") && path !== "/404" ? 404 : 200;
    res.writeHead(status, { ...headers, "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  }).listen(PORT, "127.0.0.1", () => console.log(`serving ${ROOT} on http://127.0.0.1:${String(PORT)}`));
}
