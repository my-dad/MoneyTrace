import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const EXTERNAL = ["firebase-admin", "firebase-functions"];

const pkg = JSON.parse(await readFile(join(here, "package.json"), "utf8"));
const dependencies = Object.fromEntries(
  EXTERNAL.map((name) => {
    const version = pkg.dependencies[name];
    if (typeof version !== "string" || version.includes("workspace:")) {
      throw new Error(`${name} must be a pinned dependency of apps/functions`);
    }
    return [name, version];
  }),
);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [join(here, "src/index.ts")],
  outfile: join(dist, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: EXTERNAL,
  logLevel: "warning",
});

await writeFile(
  join(dist, "package.json"),
  `${JSON.stringify(
    {
      name: "moneytrace-functions",
      private: true,
      main: "index.js",
      type: "module",
      engines: { node: "22" },
      dependencies,
    },
    null,
    2,
  )}\n`,
);
