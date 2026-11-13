// Bundles the Supabase `/api` function (CR-010): our code and its pure-JS dependencies in one ESM
// file. postgres.js is left to the function file (`npm:postgres`), Node built-ins to Deno.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../../supabase/functions/api/bundle.mjs", import.meta.url));
await build({
  entryPoints: [fileURLToPath(new URL("./src/supabase-entry.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["import", "default"],
  external: ["node:*", "postgres"],
  outfile: out,
  legalComments: "none",
  logLevel: "warning",
});
console.log(`bundled ${out}`);
