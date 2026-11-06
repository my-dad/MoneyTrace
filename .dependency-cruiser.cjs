/** Production source only: test files are excluded from every rule's `from` side. */
const TESTS = "\\.test\\.tsx?$";
/**
 * An external package, as a resolved path (pnpm's node_modules/.pnpm layout) or, when
 * resolution fails, as the bare module name.
 */
const pkg = (names) => `(^|/)node_modules/(${names})/|^(${names})(/|$)`;
const SERVER = pkg("firebase-admin|firebase-functions|firebase-tools|@google-cloud/[^/]+");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-no-dependencies",
      comment: "domain imports nothing: no packages, no node: builtins, no other layer.",
      severity: "error",
      from: { path: "(^|/)packages/domain/src/", pathNot: TESTS },
      to: { pathNot: "(^|/)packages/domain/" },
    },
    {
      name: "application-only-domain-contracts",
      comment: "application imports only domain and contracts; everything else goes through a port.",
      severity: "error",
      from: {
        path: "(^|/)packages/application/src/",
        pathNot: [TESTS, "(^|/)packages/application/src/testing/"],
      },
      to: {
        pathNot: [
          "(^|/)packages/application/",
          "(^|/)packages/domain/",
          "(^|/)packages/contracts/",
          "^@moneytrace/(domain|contracts)(/|$)",
        ],
      },
    },
    {
      name: "application-testing-only-test-libs",
      comment: "application/src/testing may additionally use vitest and fast-check.",
      severity: "error",
      from: { path: "(^|/)packages/application/src/testing/", pathNot: TESTS },
      to: {
        pathNot: [
          "(^|/)packages/application/",
          "(^|/)packages/domain/",
          "(^|/)packages/contracts/",
          "^@moneytrace/(domain|contracts)(/|$)",
          pkg("vitest|fast-check"),
        ],
      },
    },
    {
      name: "contracts-only-zod",
      comment: "contracts imports only Zod and itself; it never imports domain.",
      severity: "error",
      from: { path: "(^|/)packages/contracts/src/", pathNot: TESTS },
      to: { pathNot: ["(^|/)packages/contracts/", pkg("zod")] },
    },
    {
      name: "web-no-server-code",
      comment: "The web app never imports server code or inner layers.",
      severity: "error",
      from: { path: "(^|/)apps/web/", pathNot: TESTS },
      to: {
        path: [
          SERVER,
          "^@moneytrace/(application|infrastructure|domain)(/|$)",
          "(^|/)packages/(application|infrastructure|domain)/",
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
  },
};
