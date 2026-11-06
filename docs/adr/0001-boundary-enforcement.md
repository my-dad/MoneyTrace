# ADR 0001: Enforce layer boundaries with dependency-cruiser

Status: accepted

## Context

Spec section 3 requires strict layering: `domain` imports nothing, `application` imports only `domain` and `contracts`, `contracts` imports only Zod, and the web app never imports server code. The spec left the enforcement tool to an ADR. The candidates were `eslint-plugin-boundaries` and `dependency-cruiser`.

## Decision

Use `dependency-cruiser` (`.dependency-cruiser.cjs`, run by `pnpm boundaries`).

## Rationale

- It checks the real import graph, including external packages and `node:` builtins. `eslint-plugin-boundaries` classifies files into elements and is weaker at forbidding specific external packages.
- It can be run against fixture files. `tooling/boundaries/boundaries.test.ts` runs it on deliberately violating fixtures and asserts a non-zero exit naming the rule, plus clean fixtures that must pass. This guards against rules that silently match nothing.

## Consequences

- Rules apply to production source only. `*.test.ts(x)` files are excluded from every rule's `from` side so tests can use `vitest`, `fast-check` and `node:fs`.
- `packages/application/src/testing/` may additionally import `vitest` and `fast-check`, and nothing else outside `domain`, `contracts` and itself.
- `tooling/boundaries/fixtures` is excluded from ESLint, `tsconfig.tools.json` and Vitest discovery because the files are invalid on purpose.
- Rule paths are written as `(^|/)packages/<layer>/` so they also match the fixture tree.
