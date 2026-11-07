# ADR 0003: Bundle Cloud Functions with esbuild

Status: accepted

## Context

The Functions workspace consumes local packages through pnpm `workspace:`
dependencies. A deployed Functions build must contain the application,
contracts, domain, and infrastructure code it imports. Cloud Build cannot
resolve this repository's workspace dependency specifiers from the deployed
Functions source alone.

## Decision

Build the Functions entry point with the repository's esbuild configuration
before local emulator runs and deployments. The build emits the deployable
bundle under `apps/functions/dist`, which is the source configured in
`firebase.json`.

## Rationale

Bundling resolves workspace imports at build time, keeps the deployed artifact
independent of the monorepo layout, and makes the local emulator exercise the
same shape that deployment receives. The build remains explicit through
`pnpm build:functions` rather than being hidden inside unrelated commands.

## Consequences

- Changes to Functions or its workspace packages require a Functions build
  before emulator or deployment checks.
- The generated `apps/functions/dist` directory is a build artifact, not source
  to edit by hand.
- Bundle output and emulator behavior must be checked when adding runtime
  dependencies.
