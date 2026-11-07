# Phase 0 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested foundations of MoneyTrace: monorepo, ledger domain, Firestore adapters, security rules, the pipeline claim and provider-call protocols, authenticated callables, and provisioned environments.

**Architecture:** Clean Architecture in a pnpm monorepo. `domain` is pure TypeScript, `application` holds use cases and ports, `infrastructure` holds Firebase adapters, and `apps/*` are composition roots. Every port has one shared contract test suite that runs against both its in-memory fake and its Firestore adapter.

**Tech Stack:** TypeScript 6.0.3, Node 22, pnpm 12.18.0, Vitest 5.1.0, fast-check 4.10.2, Zod 4.6.7, firebase-admin 14.5.0, firebase-functions 7.4.0, firebase-tools 15.35.0, @firebase/rules-unit-testing 6.0.0, firebase 13.2.0, Next 16.4.5, React 19.3.1, dependency-cruiser 18.7.2, esbuild 0.28.2.

**Spec:** `docs/superpowers/specs/2026-11-06-moneytrace-architecture-design.md`. Read it with this plan. Section 8 of the spec lists what Phase 0 must produce.

## Global Constraints

- Work on branch `phase-0-foundations`. Never commit to `master` directly.
- Commit messages use Conventional Commits. **Never add `Co-Authored-By` or any attribution line.** This is Mabrur's standing rule and overrides any tool default.
- TypeScript 6.0.3 exactly, not 7.x: `typescript-eslint` 8.72.1 requires `typescript <6.1.0`.
- Java 21 or newer is required: firebase-tools 15.35.0 sets `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21`.
- Money is integer minor units plus currency code. Never a float, never implicit rounding. Cost is integer micro-USD. Confidence is integer basis points (0 to 10000).
- `domain` imports nothing, including `node:*`, Zod and Firebase.
- `application` imports only `domain` and `contracts`. Anything else goes through a port.
- `contracts` imports only Zod. It never imports `domain`.
- `infrastructure` may import `application`, `domain`, `contracts`, and Firebase. Nothing inward imports it.
- Every owner-scoped port method takes `ownerId` as a required argument. All owner data lives under `users/{ownerId}/...`.
- `ownerId` always comes from the verified Auth token, never from a request body.
- Logs carry allowlisted fields only. No raw SMS, receipt text, account numbers or secrets.
- Emulator tests use project ID `demo-moneytrace`, so they cannot touch real resources.
- Region is `asia-south2` (Delhi) for Functions, Firestore and Storage. The Firestore location is permanent, so no `dev` or `prod` database is created until the staging smoke test in Task 15 passes.

## Review Focus

Most likely first. Each has a named test in its owning task.

1. **A malformed amount reaches a command** (`12.5`, `"100"`, `NaN`, `2**53`): it is rejected before any write, and nothing is rounded. Tests in Tasks 2, 5, 6 and 12.
2. **A client reuses an idempotency key with a different payload:** the result is `idempotencyConflict`. It never returns the earlier transaction as if the new request had succeeded. Tests in Tasks 8 and 9.
3. **A signed-in user sends a forged `ownerId`, or another user's `accountId`:** the first is rejected as an invalid argument, the second as not found, and the other user's data is unchanged. Test in Task 12.
4. **A second opening balance for an account with a different amount or date:** it is rejected and the first stands, so the correction path is explicit. A double-tap with the same values is a harmless duplicate. Tests in Tasks 8 and 9.
5. **A transaction is reversed twice, including concurrently:** exactly one correction wins and balances move once. Tests in Tasks 8 and 9.

## Scope boundary

OCR and receipt processing are explicitly deferred. Do not implement a local or
managed OCR provider, receipt upload flow, OCR benchmark, or Storage dependency
as part of the current P0/P1 work. Preserve the provider interfaces and
architecture notes for a later phase, but keep the current product path focused
on authenticated ledger workflows and SMS/text evidence.

| Deferred | To |
|---|---|
| SMS parsers, `AIProvider`, `AIGateway`, DeepSeek adapter, `ResumeQuotaBlockedEvents`, `MatchingService` and `PendingAuthorization` matching, `FollowUp` and `CashAllocation` aggregates and handlers, deployed pipeline triggers and recovery schedule, delivery of 80% quota warnings to the user, the Settings disclosure that OCR, Firestore, Functions, Storage and egress costs are separate from the AI budget, a screen for AI usage metrics, `ui-kit`, Storybook, axe checks, TanStack Query, `ReadModelGateway`, PWA shell, Playwright | Phase 1 |
| `OCRProvider`, Storage upload flow, `DeleteTemporaryUpload`, sweeper | Deferred by PRD CR-001; before it returns, settle the bearer download-token issue found in Task 7's review |
| Real projects, Blaze, deployed Functions, App Check enforcement, rate limits, spending controls, backups, restore drill, CI | Phase 0B (PRD CR-002) |
| `Reconciliation` aggregate, reports | Phase 3 |
| `ExportUserData`, `RequestAccountDeletion`, deletion-log replay, scheduled Auth export | Phase 4 |

Release gates after Phase 0: **33, 35 and 36** have their owning tests green. **25 and 26** are green at domain and adapter level and complete end to end at the Phase 1 exit. Gates 27 to 32 and 34 belong to later phases. The spec's traceability rows for claims, provider calls, owner scoping, and the registry CI test are also green.

## File structure

```
pnpm-workspace.yaml, package.json, tsconfig.base.json, vitest.config.ts, vitest.emulator.config.ts
eslint.config.js, .prettierrc.json, .dependency-cruiser.cjs, firebase.json, .firebaserc
firebase/            firestore.rules, firestore.indexes.json, storage.rules, rules tests
tooling/boundaries/  boundary-rule test and violating fixtures
tools/restore-drill/ seed and verify script for the restore drill
packages/domain/src/
  errors.ts, money.ts, ids.ts, ledger-date.ts
  ledger/      account-ref.ts, entry.ts, cutover.ts, transaction.ts
  posting/     intents.ts, posting-policy.ts, strategies/<one file per intent>.ts
  pipeline/    source-event.ts, provider-call.ts
  decision/    confidence-policy.ts
packages/contracts/src/
  primitives.ts, retention-policy.ts, confidence-config.ts
  firestore/   collections.ts, owner-data-registry.ts
  commands/    registry.ts, <one file per area>.ts
  triggers.ts
packages/application/src/
  ports/       one file per port
  use-cases/   one file per use case
  pipeline/    run-stage.ts, provider-call-executor.ts, recover-expired-claims.ts, retry-provider-call.ts, purge-provider-results.ts, timeouts.ts
  testing/     in-memory fakes and shared contract suites (subpath export)
packages/infrastructure/src/
  firestore/   one adapter per repository port
  system/      system-clock.ts, crypto-id-generator.ts, node-hasher.ts, json-logger.ts
apps/functions/src/  index.ts, composition.ts, callable/create-callable.ts, callable/<command>.ts
apps/web/src/        app/, features/auth/, shared/
docs/adr/, docs/architecture/, docs/runbooks/, docs/GLOSSARY.md
```

Each package exports TypeScript source through `"exports": { ".": "./src/index.ts" }`. Vitest, esbuild and Next compile it, so packages have no build step. Package names are `@moneytrace/<dir>`.

---

### Task 1: Monorepo, tooling and boundary enforcement

**Files:**
- Create: root config files listed above, `packages/{domain,contracts,application,infrastructure}/{package.json,tsconfig.json,src/index.ts}`, `tooling/boundaries/boundaries.test.ts`, `tooling/boundaries/fixtures/**`, `docs/adr/0001-boundary-enforcement.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: root scripts used by every later task: `pnpm test`, `pnpm test:emulator`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`, `pnpm verify`.

- [ ] **Step 1: Check prerequisites**

Run: `java -version` and `corepack --version`
Expected: Java major version is 21 or newer, and corepack prints a version. **If Java is older, stop and ask Mabrur to install JDK 21.** Task 1 can finish without it, but Task 7 cannot start.

- [ ] **Step 2: Create the branch and enable pnpm**

Run: `git switch phase-0-foundations && corepack enable && corepack prepare pnpm@12.18.0 --activate && pnpm --version`
Expected: `12.18.0`. If `corepack enable` cannot write its shims, use `corepack pnpm` in place of `pnpm` throughout.

- [ ] **Step 3: Write the root configuration**

- `package.json`: `"private": true`, `"type": "module"`, `"packageManager": "pnpm@12.18.0"`, `"engines": { "node": ">=22.12 <23" }`, plus the scripts below. Pin every dev dependency to the exact versions in Tech Stack, and add `vite` 8.3.6, `@types/node` 22.20.5, `eslint` 10.14.0, `typescript-eslint` 8.72.1, `prettier` 3.9.10.
- `pnpm-workspace.yaml`: `packages/*`, `apps/*`.
- `tsconfig.tools.json`: extends the base and includes `tooling`, `firebase` and `tools`, whose tests no package typecheck covers. The root also takes dev dependencies on `@moneytrace/contracts`, `@firebase/rules-unit-testing` and `firebase` for those tests.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2023`, `noEmit`, `verbatimModuleSyntax`.
- `vitest.config.ts`: includes `**/*.test.{ts,tsx}`, excludes `**/*.emulator.test.ts`, `node_modules` and `tooling/boundaries/fixtures`.
- `vitest.emulator.config.ts`: includes `**/*.emulator.test.ts`, with `fileParallelism: false`.
- `.gitignore`: change `/node_modules` to `node_modules`, and add `dist/`, `.next/`, `.firebase/`, `firebase-debug.log`, `firestore-debug.log`, `*service-account*.json`, `drill-expected.json`.

| Script | Command |
|---|---|
| `test` | `vitest run` |
| `test:emulator` | `pnpm build:functions && firebase emulators:exec --project demo-moneytrace --only auth,firestore,storage,functions "vitest run --config vitest.emulator.config.ts"` |
| `typecheck` | `pnpm -r typecheck && tsc -p tsconfig.tools.json` |
| `lint` | `eslint .` |
| `boundaries` | `depcruise packages apps --config .dependency-cruiser.cjs` |
| `verify` | `pnpm lint && pnpm typecheck && pnpm boundaries && pnpm test` |

Until Task 12 adds it, define `build:functions` as a no-op, and use `--only auth,firestore,storage` in `test:emulator`.

- [ ] **Step 4: Write the failing boundary test**

`tooling/boundaries/boundaries.test.ts` shells out to depcruise on each fixture and asserts a non-zero exit and that the output names the rule:

| Fixture importing | Expected rule |
|---|---|
| `fixtures/packages/domain/src/uses-zod.ts` imports `zod` | `domain-no-dependencies` |
| `fixtures/packages/domain/src/uses-node.ts` imports `node:crypto` | `domain-no-dependencies` |
| `fixtures/packages/application/src/uses-firebase.ts` imports `firebase-admin` | `application-only-domain-contracts` |
| `fixtures/packages/application/src/uses-infra.ts` imports `../../infrastructure/src/x` | `application-only-domain-contracts` |
| `fixtures/packages/contracts/src/uses-domain.ts` imports `../../domain/src/x` | `contracts-only-zod` |
| `fixtures/apps/web/src/uses-admin.ts` imports `firebase-admin` | `web-no-server-code` |

A `fixtures/packages/domain/src/clean.ts` with a relative import inside `domain` must exit zero. This guards against rules that silently match nothing.

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm vitest run tooling/boundaries`
Expected: FAIL, because the rules do not exist yet.

- [ ] **Step 6: Write `.dependency-cruiser.cjs` and `eslint.config.js`**

Rule paths must be written as `(^|/)packages/domain/` so they also match the fixtures. `web-no-server-code` also forbids `@moneytrace/{application,infrastructure,domain}`. `eslint.config.js` uses `typescript-eslint` strict type-checked rules, plus `no-restricted-syntax` banning `parseFloat` and `toFixed` in `packages/domain`.

- [ ] **Step 7: Write ADR 0001 and run the full check**

ADR 0001 records choosing dependency-cruiser over `eslint-plugin-boundaries`: it checks the real import graph including external packages and `node:` builtins, and it can be run against fixtures. Spec section 3 left this choice to an ADR.

Run: `pnpm install && pnpm verify`
Expected: all pass. If pnpm reports ignored build scripts for `esbuild`, approve that package using the instruction pnpm prints, and commit the resulting configuration.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with enforced layer boundaries"
```

---

### Task 2: Money, identifiers and dates

**Files:**
- Create: `packages/domain/src/{errors,money,ids,ledger-date}.ts` with `.test.ts` beside each

**Interfaces:**
- Produces:
  - `class DomainError extends Error { code: DomainErrorCode }`, where codes are `invalidMoney | currencyMismatch | unbalancedEntries | invalidIntent | invalidTransition | invalidId | invalidDate | beforeCutover | accountInvalid | invalidConfig`
  - `type CurrencyCode = 'BDT'`
  - `class Money { static ofMinor(minor: number, currency: CurrencyCode): Money; readonly minor: number; readonly currency: CurrencyCode; add(o: Money): Money; subtract(o: Money): Money; negate(): Money; isZero(): boolean; isPositive(): boolean; isNegative(): boolean; equals(o: Money): boolean; allocate(ratios: readonly number[]): Money[] }`
  - Branded strings `OwnerId`, `AccountId`, `TransactionId`, `SourceEventId`, `IdempotencyKey` with `asOwnerId(s)` and so on, all validating `^[A-Za-z0-9_:.-]{1,128}$`
  - `class LedgerDate { static fromEpochMs(ms: number): LedgerDate; static fromIso(iso: string): LedgerDate; readonly epochMs: number; toIso(): string; isAfter(o: LedgerDate): boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
it.each([12.5, NaN, Infinity, 2 ** 53])('rejects non-safe-integer minor %s', (v) => {
  expect(() => Money.ofMinor(v, 'BDT')).toThrowError(expect.objectContaining({ code: 'invalidMoney' }));
});
it('rejects a string minor at runtime', () => {
  expect(() => Money.ofMinor('100' as unknown as number, 'BDT')).toThrowError(expect.objectContaining({ code: 'invalidMoney' }));
});
it('throws when addition leaves the safe integer range', () => {
  expect(() => Money.ofMinor(Number.MAX_SAFE_INTEGER, 'BDT').add(Money.ofMinor(1, 'BDT'))).toThrowError(expect.objectContaining({ code: 'invalidMoney' }));
});
it('allocates exactly, largest remainder first', () => {
  expect(Money.ofMinor(100, 'BDT').allocate([1, 1, 1]).map((m) => m.minor)).toEqual([34, 33, 33]);
});
```

Also test: `allocate` rejects empty, negative, non-integer or all-zero ratios; a negative amount allocates so the parts still sum exactly. Add a fast-check property: for any safe amount and ratios, `allocate` parts sum to the original. Test that IDs reject `''`, `a/b` and a 129-character string, and that `LedgerDate.fromIso('not-a-date')` throws `invalidDate`. `currencyMismatch` cannot be triggered with one `CurrencyCode`, so test it by casting a second code.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/domain/src`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four modules and export them from `packages/domain/src/index.ts`**

`Money` is frozen. Check every arithmetic result with `Number.isSafeInteger`. `allocate` uses `BigInt` internally so `minor * ratio` cannot lose precision.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/domain/src && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add Money, branded identifiers and LedgerDate"
```

---

### Task 3: Ledger entries, posting policy and all intents

**Files:**
- Create: `packages/domain/src/ledger/{account-ref,entry,cutover}.ts`, `packages/domain/src/posting/{intents,posting-policy}.ts`, `packages/domain/src/posting/strategies/*.ts`, tests beside them

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `type RealAccountKind = 'bank' | 'cash' | 'familyCash' | 'creditLiability'`; `type AccountKind = RealAccountKind | 'expense' | 'income' | 'equity'`
  - `type AccountRef = { id: AccountId; kind: AccountKind; currency: CurrencyCode }`
  - `nominal.expense(category, currency)`, `nominal.income(category, currency)`, `nominal.openingEquity(currency)`, `nominal.adjustmentEquity(currency)`, with IDs `nominal:expense:<category>:<CUR>`, `nominal:income:<category>:<CUR>`, `nominal:equity:opening:<CUR>`, `nominal:equity:adjustment:<CUR>`. Categories must be lowercase kebab-case.
  - `isRealAccount(ref): boolean`
  - `type EntryDraft = { account: AccountRef; side: 'debit' | 'credit'; amount: Money }`
  - `assertBalanced(entries: readonly EntryDraft[]): void`, `reverseEntries(entries): EntryDraft[]`
  - `type CutoverMarker = { accountId: AccountId; effectiveAt: LedgerDate }`
  - `type PostingIntent` (discriminated on `type`, table below)
  - `type PostingStrategy<I extends PostingIntent> = { type: I['type']; toEntries(intent: I, ctx: { delegate(i: PostingIntent): EntryDraft[] }): EntryDraft[] }`
  - `createPostingPolicy(strategies): PostingPolicy`, `defaultPostingPolicy`, `PostingPolicy.toEntries(intent): EntryDraft[]`, which always runs `assertBalanced` on a non-empty result

**Intent table.** Each row is one strategy file. `D` is debit and `C` is credit. Assets rise on debit, liabilities on credit.

| `type` | Fields | Entries | Throws `invalidIntent` when |
|---|---|---|---|
| `withdrawal` | `bank, cash, amount` | D cash, C bank | `bank` is not `bank`; `cash` is not `cash` |
| `transfer` | `from, to, amount` | D to, C from | same account; pair is not bank→bank, cash→bank or cash→cash (those have dedicated intents) |
| `purchase` | `funding, category, amount` | D expense:category, C funding | funding is not `bank`, `cash` or `familyCash` |
| `cardPurchase` | `card, category, amount` | D expense:category, C card | card is not `creditLiability` |
| `cardRepayment` | `bank, card, amount` | D card, C bank | wrong kinds |
| `income` | `destination, category, amount` | D destination, C income:category | destination is not `bank` or `cash` |
| `fee` | `charged, amount` | D expense:fees, C charged | charged is not `bank` or `creditLiability` |
| `refund` | `target, category, amount` | D target, C expense:category | target is nominal |
| `adjustment` | `account, direction, amount, cause, authorizedBy` | asset increase: D account, C adjustmentEquity; asset decrease: reverse. Liability increase: C account, D adjustmentEquity; decrease: reverse | blank `cause` or `authorizedBy`; nominal account |
| `openingBalance` | `account, amount` (signed), `effectiveAt` | positive asset: D account, C openingEquity. Positive liability: C account, D openingEquity. Negative flips. Zero returns `[]` | nominal account |
| `cashCustodyTransfer` | `from, to, amount, holderName` | D to, C from | same account; either is not `cash` or `familyCash`; neither is `familyCash`; blank `holderName` |
| `historicalImport` | `inner, occurredAt, cutovers: CutoverMarker[]` | delegates to `inner` | `inner` is `openingBalance` or `historicalImport` |

`historicalImport` also throws `beforeCutover` when any real account in the delegated entries has no marker in `cutovers`, or when `occurredAt` is at or before that account's marker. All amounts except `openingBalance` must be positive, or the strategy throws `invalidIntent`.

- [ ] **Step 1: Write the failing tests**

`entry.test.ts`: `assertBalanced` throws `unbalancedEntries` for: `[]`; a single entry; debits not equal to credits; a zero or negative amount; and mixed currency, or an account currency different from its amount's.

`strategies.test.ts`: drive one `it.each` from the intent table, asserting exact `{accountId, side, minor}` for valid input and the error code for each rejection. Then these named invariant tests:

```ts
it('gate 25: a withdrawal moves bank to cash and recognizes no expense', () => {
  const entries = policy.toEntries({ type: 'withdrawal', bank, cash, amount: bdt(500_000) });
  expect(raw(entries)).toEqual([
    { accountId: cash.id, side: 'debit', minor: 500_000 },
    { accountId: bank.id, side: 'credit', minor: 500_000 },
  ]);
  expect(entries.some((e) => e.account.kind === 'expense')).toBe(false);
});
it('gate 26: a purchase is one expense and a partial repayment reduces the liability by the amount paid', () => {
  const bought = policy.toEntries({ type: 'cardPurchase', card, category: 'groceries', amount: bdt(100_000) });
  const paid = policy.toEntries({ type: 'cardRepayment', bank, card, amount: bdt(40_000) });
  expect(signedFor(card, [...bought, ...paid])).toBe(-60_000); // debit minus credit: 60,000 still owed
  expect(paid.some((e) => e.account.kind === 'expense')).toBe(false);
  expect(bought.filter((e) => e.account.kind === 'expense')).toHaveLength(1);
});
it('a repayment above the amount owed is allowed and leaves a credit balance', () => {
  const entries = policy.toEntries({ type: 'cardRepayment', bank, card, amount: bdt(999_999) });
  expect(signedFor(card, entries)).toBe(999_999);
});
it('custody transfer to family cash recognizes no expense', () => { /* same shape as gate 25 */ });
it('opening balance recognizes neither income nor expense', () => { /* asserts no expense or income kind */ });
it('adjustment never touches an expense account', () => { /* both directions */ });
it('gate 36: an import at or before the cutover is rejected', () => {
  const cutovers = [{ accountId: bank.id, effectiveAt: t(1000) }];
  const inner = { type: 'purchase', funding: bank, category: 'groceries', amount: bdt(1) } as const;
  expect(() => policy.toEntries({ type: 'historicalImport', inner, occurredAt: t(1000), cutovers })).toThrowError(expect.objectContaining({ code: 'beforeCutover' }));
  expect(policy.toEntries({ type: 'historicalImport', inner, occurredAt: t(1001), cutovers })).toHaveLength(2);
});
```

Property tests (fast-check) over generated valid intents of every type: `assertBalanced` holds; applying entries plus `reverseEntries(entries)` gives zero net per account. Also: `createPostingPolicy` given an extra strategy handles the new type with no change to existing strategies, which is the open/closed check from spec section 3.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/domain/src/ledger packages/domain/src/posting`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the modules from the Interfaces block and intent table**

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/domain && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add balanced entries and posting strategies for every intent"
```

---

### Task 4: Lifecycles, provider retry decisions and ConfidencePolicy

**Files:**
- Create: `packages/domain/src/ledger/transaction.ts`, `packages/domain/src/pipeline/{source-event,provider-call}.ts`, `packages/domain/src/decision/confidence-policy.ts`, tests beside them

**Interfaces:**
- Produces:
  - `type TransactionState = 'pending' | 'posted' | 'rejected' | 'reversed'`; `assertTransition(from: TransactionState | null, to: TransactionState): void`. Allowed: `null→pending`, `null→posted`, `pending→posted`, `pending→rejected`, `posted→reversed`.
  - `type SourceEventStatus = 'received' | 'normalized' | 'interpreted' | 'matched' | 'decided' | 'posted' | 'linkedAsDuplicate' | 'rejected' | 'cancelled' | 'pending' | 'deadLetter'`; `isTerminal(status): boolean` is true for `posted`, `linkedAsDuplicate`, `rejected`, `cancelled`.
  - `type PipelineStage = 'normalize' | 'interpret' | 'match' | 'decide' | 'post'`; `STAGE_INPUT_STATUS: Record<PipelineStage, SourceEventStatus>` maps them to `received`, `normalized`, `interpreted`, `matched`, `decided` in order.
  - `type PendingReason = 'awaitingClarification' | 'aiQuotaExhausted' | 'providerOutcomeUnknown'`; `type DeadLetterReason = 'attemptsExhausted' | 'providerResultMissing' | 'stageFailed'`
  - `type ProviderCallState = 'started' | 'succeeded' | 'failed' | 'unknown' | 'purged'`; `type RetrySafety = 'idempotentKey' | 'localPure' | 'none'`
  - `nextProviderAction(input: { state: ProviderCallState | null; hasResult: boolean; retrySafety: RetrySafety; attemptCount: number; maxAttempts: number; userApprovedRetry: boolean }): 'invoke' | 'reuseResult' | 'awaitUserDecision' | 'resultMissing' | 'exhausted'`
  - `decide(input: DecisionInput, config: ConfidenceConfig): { outcome: 'autoPost' | 'needsClarification' | 'failed'; rule: string }`
  - `type DecisionInput = { extractionUsable: boolean; invariantsPass: boolean; accountMappingUnambiguous: boolean; unresolvedDuplicateCandidate: boolean; parsersConflict: boolean; source: 'deterministicParser' | 'ai'; confidenceBp: number; retriedAfterUnknownInChain: boolean }`
  - `type ConfidenceConfig = { version: number; aiAutoPostThresholdBp: number }`
  - `type DecisionRecord` with the fields listed in spec section 5 stage 5

- [ ] **Step 1: Write the failing tests**

`assertTransition`: `it.each` over every pair of states, allowed list passes and all others throw `invalidTransition`. This includes `reversed→reversed` and `posted→posted`.

`nextProviderAction`, one `it.each` row per line:

| state | hasResult | retrySafety | attempts/max | approved | expected |
|---|---|---|---|---|---|
| `null` | no | any | 0/3 | no | `invoke` |
| `succeeded` | yes | any | 1/3 | no | `reuseResult` |
| `succeeded` | yes | any | 1/3 | yes | `reuseResult` |
| `succeeded` | no | `none` | 1/3 | no | `resultMissing` |
| `succeeded` | no | `none` | 1/3 | yes | `invoke` |
| `purged` | no | `none` | 1/3 | no | `resultMissing` |
| `purged` | no | `none` | 1/3 | yes | `invoke` |
| `failed` | no | `none` | 1/3 | no | `invoke` |
| `failed` | no | `none` | 3/3 | no | `exhausted` |
| `unknown` | no | `none` | 1/3 | no | `awaitUserDecision` |
| `unknown` | no | `none` | 1/3 | yes | `invoke` |
| `unknown` | no | `none` | 3/3 | no | `awaitUserDecision` |
| `unknown` | no | `idempotentKey` | 1/3 | no | `invoke` |
| `unknown` | no | `localPure` | 1/3 | no | `invoke` |
| `unknown` | no | `idempotentKey` | 3/3 | no | `exhausted` |
| `started` | no | `none` | 1/3 | no | `awaitUserDecision` |
| `started` | no | `localPure` | 1/3 | no | `invoke` |

`decide`: one test for each rule, confirming that only the all-clear inputs auto-post:

```ts
const clear: DecisionInput = { extractionUsable: true, invariantsPass: true, accountMappingUnambiguous: true, unresolvedDuplicateCandidate: false, parsersConflict: false, source: 'deterministicParser', confidenceBp: 0, retriedAfterUnknownInChain: false };
it('auto-posts a clear deterministic match', () => expect(decide(clear, config).outcome).toBe('autoPost'));
it('never auto-posts AI output with the default threshold', () => {
  expect(decide({ ...clear, source: 'ai', confidenceBp: 10000 }, DEFAULT).outcome).toBe('needsClarification');
});
it('auto-posts AI output at the threshold once configured', () => {
  expect(decide({ ...clear, source: 'ai', confidenceBp: 9000 }, { version: 2, aiAutoPostThresholdBp: 9000 }).outcome).toBe('autoPost');
});
it('never auto-posts anything in a retried-after-unknown chain', () => {
  expect(decide({ ...clear, retriedAfterUnknownInChain: true }, config).outcome).toBe('needsClarification');
});
it.each([{ extractionUsable: false }, { invariantsPass: false }])('fails %o', (o) => expect(decide({ ...clear, ...o }, config).outcome).toBe('failed'));
it.each([{ accountMappingUnambiguous: false }, { unresolvedDuplicateCandidate: true }, { parsersConflict: true }])('asks about %o', (o) => expect(decide({ ...clear, ...o }, config).outcome).toBe('needsClarification'));
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/domain/src/pipeline packages/domain/src/decision packages/domain/src/ledger/transaction`
Expected: FAIL.

- [ ] **Step 3: Implement the modules from the Interfaces block**

`decide` checks in this order: `failed` rules, `parsersConflict`, `retriedAfterUnknownInChain`, mapping and duplicate checks, and finally source and threshold. An out-of-range `confidenceBp` throws `invalidConfig`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/domain && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): add lifecycles, provider retry decisions and ConfidencePolicy"
```

---

### Task 5: Firestore schemas, OwnerDataRegistry and retention

**Files:**
- Create: `packages/contracts/src/{primitives,retention-policy,confidence-config}.ts`, `packages/contracts/src/firestore/{collections,owner-data-registry}.ts`, tests beside them, `docs/architecture/firestore-schema.md`

**Interfaces:**
- Produces:
  - `minorAmount` (`z.number().int().safe()`), `positiveMinorAmount`, `currencyCode`, `epochMs`, `documentId`
  - `OWNER_COLLECTIONS`: `{ accounts, paymentInstruments, sourceEvents, providerCalls, transactions, ledgerEntries, balances, idempotencyRecords, cutoverMarkers, decisionRecords, cashAllocations, reconciliations, followUps, conversations, conversationMessages, aiUsage, quotaCounters, temporaryUploads, consents, deletionJobs }`, each a `.strict()` Zod schema
  - `type OwnerCollectionName = keyof typeof OWNER_COLLECTIONS`
  - `userProfileSchema` for the `users/{uid}` document
  - `OWNER_DATA_REGISTRY: Record<OwnerCollectionName, { retentionClass: RetentionClass; exportTreatment: 'included' | 'excluded'; clientRead: boolean }>`
  - `type RetentionClass = 'untilAccountDeletion' | 'providerResult' | 'conversation' | 'temporaryUpload'`
  - `deletionLogEntrySchema = { ownerIdHash, deletedAtMs }` for the top-level, server-only `deletionLog` collection. It is outside `users/`, so it survives account deletion and is not in the registry. Phase 4 writes real entries and adds the replay
  - `retentionPolicySchema`, `DEFAULT_RETENTION_POLICY = { version: 1, temporaryUploadMaxHours: 24, providerResultDays: 30, conversationDays: 365, operationalLogDays: 30 }`. `temporaryUploadMaxHours` is a ceiling for abandoned files; normal deletion happens as soon as evidence is persisted. `operationalLogDays` covers Cloud Logging only and never applies to accounting records
  - `confidenceConfigSchema`, `DEFAULT_CONFIDENCE_CONFIG = { version: 1, aiAutoPostThresholdBp: 10001 }`. 10001 is above the maximum score, so AI cannot auto-post until Phase 1 tunes the value against fixtures.

Key shapes that later tasks depend on:

| Collection | Required fields |
|---|---|
| `accounts` | `id, kind, name, currency, status: active\|closed, createdAtMs` (nominal accounts are never stored here) |
| `transactions` | `id, state, intentType, occurredAtMs, currency, sourceEventIds, actor, rationale?, correctionOf?, reversedBy?, committedAtMs` |
| `ledgerEntries` | `id` (`<transactionId>:<seq>`), `transactionId, accountId, accountKind, side, amountMinor, currency, occurredAtMs` |
| `balances` | `accountId, accountKind, currency, debitMinusCreditMinor, version, updatedAtMs` |
| `idempotencyRecords` | `key, payloadHash, transactionId?, sourceEventId?, createdAtMs`. Doc IDs are namespaced: `ledger:<key>`, `source:<key>`, `hash:<sourceHash>` |
| `cutoverMarkers` | `accountId, effectiveAtMs, transactionId` |
| `sourceEvents` | `id, sourceType, sourceHash, idempotencyKey, status, pendingReason?, deadLetterReason?, stageAttempt, claim: {workerId, stage, leaseExpiresAtMs}\|null, parkedStage: stage\|null, version, receivedAtMs, terminalAtMs: number\|null, providerResultsPurged` |
| `providerCalls` | `id, sourceEventId, stage, providerId, retrySafety, state, requestKey, attemptCount, userApprovedRetry, retriedAfterUnknown, quotaReservationId?, result?, updatedAtMs` |
| `quotaCounters` | `window, reservedMicroUsd, warnedAtMs: number\|null, updatedAtMs` (doc ID is `YYYY-MM` or `YYYY-MM-DD`, UTC) |
| `aiUsage` | `id, providerId, model?, inputTokens?, outputTokens?, estimatedMicroUsd, actualMicroUsd?, outcome: success\|definiteFailure\|unknown, errorCode?, userApprovedRetry, sourceEventId, stage, attempt, createdAtMs` |

Derive the remaining collections from PRD section 9. Balance is signed raw: a liability's displayed amount owed is `-debitMinusCreditMinor`.

`OWNER_DATA_REGISTRY` assigns: `providerCalls` to `providerResult`; `conversations` and `conversationMessages` to `conversation`; `temporaryUploads` to `temporaryUpload`; all others to `untilAccountDeletion`. Only `idempotencyRecords` has `exportTreatment: 'excluded'`, matching the spec's exclusion list. `clientRead` is false for `idempotencyRecords`, `providerCalls`, `quotaCounters` and `deletionJobs`, and true for all others.

- [ ] **Step 1: Write the failing tests**

```ts
it('every owner collection is registered, and the registry has no extras', () => {
  expect(Object.keys(OWNER_DATA_REGISTRY).sort()).toEqual(Object.keys(OWNER_COLLECTIONS).sort());
});
it('every collection named in the schema document is registered', () => {
  // parse the ### headings of docs/architecture/firestore-schema.md
  expect(headingsInSchemaDoc().sort()).toEqual(Object.keys(OWNER_COLLECTIONS).sort());
});
it.each([12.5, '100', NaN, 2 ** 53])('rejects malformed amount %s', (v) => {
  expect(minorAmount.safeParse(v).success).toBe(false);
});
it('rejects unknown fields on documents', () => {
  expect(OWNER_COLLECTIONS.accounts.safeParse({ ...validAccount, extra: 1 }).success).toBe(false);
});
it('the default confidence threshold cannot be reached', () => {
  expect(DEFAULT_CONFIDENCE_CONFIG.aiAutoPostThresholdBp).toBeGreaterThan(10000);
});
it('only idempotency records are excluded from export', () => { /* filter the registry */ });
it.each(['transactions', 'ledgerEntries', 'decisionRecords', 'sourceEvents', 'cutoverMarkers'])('audit collection %s is never on a timed retention class', (name) => {
  expect(OWNER_DATA_REGISTRY[name].retentionClass).toBe('untilAccountDeletion');
});
```

Also test `retentionPolicySchema` rejects zero or negative windows.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/contracts`
Expected: FAIL.

- [ ] **Step 3: Implement schemas, and write `docs/architecture/firestore-schema.md`**

The document has one `###` heading per collection (exact collection name), its path, and its fields. It also has a "Balance projection" section stating: balances are written inside the ledger commit transaction; they hold `debitMinusCreditMinor`; they can always be recomputed from `ledgerEntries`, and a test proves this (Task 9).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/contracts && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts docs/architecture
git commit -m "feat(contracts): add Firestore schemas, data registry and retention policy"
```

---

### Task 6: Command and trigger contracts

**Files:**
- Create: `packages/contracts/src/commands/*.ts`, `packages/contracts/src/triggers.ts`, `packages/contracts/src/commands/registry.test.ts`, `docs/architecture/function-contracts.md`

**Interfaces:**
- Consumes: `primitives` from Task 5.
- Produces: `COMMANDS: Record<CommandName, { request: ZodType; response: ZodType }>`, `TRIGGERS: Record<TriggerName, { kind: 'firestore' | 'schedule'; source: string; input?: ZodType }>`, and for Task 12: `createAccountRequest = { kind, name, currency }`, `createAccountResponse = { accountId }`, `recordOpeningBalanceRequest = { accountId, amountMinor, currency, effectiveAtMs }`, `recordOpeningBalanceResponse = { transactionId, status: 'recorded' | 'alreadyRecorded' }`, `bootstrapUserRequest = {}`, `bootstrapUserResponse = { created: boolean }`.

| Command | Key request fields | Phase with handler |
|---|---|---|
| `bootstrapUser` | none | 0 |
| `createAccount` | `kind, name, currency` | 0 |
| `recordOpeningBalance` | `accountId, amountMinor, currency, effectiveAtMs` | 0 |
| `createPaymentInstrument` | `accountId, maskedIdentifier, type` | 1 |
| `updateSettings` | `reportingCycle?, reminders?, aiBudget?` | 1 |
| `submitEvidence` | `idempotencyKey, text` | 1 |
| `sendChatMessage` | `conversationId, text` | 1 |
| `confirmCandidate` | `sourceEventId, decision, overrides?` | 1 |
| `resolveFollowUp` | `followUpId, resolution` | 1 |
| `snoozeFollowUp` | `followUpId, untilMs` | 1 |
| `retrySourceEvent` | `sourceEventId` (explicit user retry) | 1 |
| `cancelSourceEvent` | `sourceEventId` | 1 |
| `correctTransaction` | `idempotencyKey, transactionId, replacement?, rationale` | 1 |
| `recordCustodyTransfer` | `idempotencyKey, fromAccountId, toAccountId, amountMinor, currency, holderName` | 1 |
| `upsertCashAllocation` | `walletId, purpose, amountMinor, currency` | 1 |
| `createUploadSession` | `mimeType, sizeBytes` | 2 |
| `finalizeUpload` | `uploadId, idempotencyKey` | 2 |
| `setOcrConsent` | `consentVersion, granted` | 2 |
| `recordReconciliation` | `accountId, countedMinor, currency, countedAtMs` | 3 |
| `recordAdjustment` | `idempotencyKey, accountId, direction, amountMinor, currency, cause` | 3 |
| `requestExport` | none | 4 |
| `requestAccountDeletion` | `confirmation` | 4 |

| Trigger | Kind | Source | Phase deployed |
|---|---|---|---|
| `onSourceEventWritten` | firestore | `users/{uid}/sourceEvents/{id}` | 1 |
| `recoverExpiredClaims` | schedule | every 5 minutes | 1 |
| `dispatchFollowUps` | schedule | every 15 minutes | 1 |
| `resumeQuotaBlockedEvents` | schedule | hourly | 1 |
| `sweepAbandonedUploads` | schedule | hourly | 2 |
| `purgeProviderResults` | schedule | daily | 1 |

- [ ] **Step 1: Write the failing tests**

```ts
it('every command has strict request and response schemas', () => {
  for (const [name, c] of Object.entries(COMMANDS)) {
    expect(c.request.safeParse({ ...validRequest(name), injected: 1 }).success, name).toBe(false);
  }
});
it.each(Object.keys(COMMANDS))('%s has no ownerId in its request', (name) => {
  expect(COMMANDS[name].request.safeParse({ ...validRequest(name), ownerId: 'someone' }).success).toBe(false);
});
it.each([12.5, '100', NaN, 2 ** 53])('recordOpeningBalance rejects amount %s', (amountMinor) => {
  expect(COMMANDS.recordOpeningBalance.request.safeParse({ ...validOpening, amountMinor }).success).toBe(false);
});
it('function-contracts.md documents every command and trigger', () => { /* compares headings to registry keys */ });
```

`validRequest(name)` is a test helper with one valid example per command, and it fails the test if a command has no example.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/contracts/src/commands`
Expected: FAIL.

- [ ] **Step 3: Implement the schemas and write `docs/architecture/function-contracts.md`**

The document has one `###` heading per command and trigger, listing request, response, error codes and owning use case. Text-bearing evidence fields cap at 10,000 characters. Upload limits are 10 MB and `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, the same values as `storage.rules` in Task 7.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/contracts && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts docs/architecture
git commit -m "feat(contracts): define callable and trigger contracts"
```

---

### Task 7: Security rules (gate 35)

**Files:**
- Create: `firebase.json`, `firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/storage.rules`, `firebase/rules.emulator.test.ts`

**Interfaces:**
- Consumes: `OWNER_DATA_REGISTRY` from Task 5.
- Produces: emulator configuration on ports auth 9099, firestore 8080, storage 9199, functions 5001, with `singleProjectMode: true`. `firebase.json` functions `source` is `apps/functions/dist`, runtime `nodejs22`.

- [ ] **Step 1: Write the failing rules tests**

Data-driven from the registry, so a new collection is covered automatically:

```ts
describe.each(Object.entries(OWNER_DATA_REGISTRY))('%s', (name, entry) => {
  it('denies another user reading', () => assertFails(getDoc(doc(alice, `users/bob/${name}/x`))));
  it('denies the owner writing', () => assertFails(setDoc(doc(bob, `users/bob/${name}/x`), { a: 1 })));
  it('denies the owner deleting', () => assertFails(deleteDoc(doc(bob, `users/bob/${name}/seeded`))));
  it('denies an anonymous read', () => assertFails(getDoc(doc(anon, `users/bob/${name}/x`))));
  it('matches clientRead for the owner', () => {
    const read = getDoc(doc(bob, `users/bob/${name}/seeded`));
    return entry.clientRead ? assertSucceeds(read) : assertFails(read);
  });
});
```

Also test:
- Firestore: a user can read their own `users/{uid}` profile and cannot write it; another user cannot read it; any path outside `users/` is denied, including `deletionLog/x`; a collection-group query over `ledgerEntries` by a client is denied.
- Storage, path `users/{uid}/uploads/{uploadId}`: owner creates a 1 MB `image/png`, succeeds; another user's path, fails; 10 MB + 1 byte, fails; `text/html`, fails; no auth, fails; owner overwrites an existing object, fails; owner reads, fails; owner deletes, fails.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm firebase emulators:exec --project demo-moneytrace --only firestore,storage "vitest run --config vitest.emulator.config.ts firebase/rules"`
Expected: FAIL on the `assertSucceeds` cases, because no rules grant access yet.

- [ ] **Step 3: Write the rules and indexes**

`firestore.rules` denies by default and allows only owner `read` on each collection with `clientRead: true`, listed explicitly. `storage.rules` allows only `create` under the owner's upload path, with the limits above.

`firestore.indexes.json` declares collection-group field overrides for `sourceEvents.claim.leaseExpiresAtMs` and `sourceEvents.terminalAtMs`, used by Tasks 10 and 11.

- [ ] **Step 4: Run to verify pass**

Run the command from Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firebase.json firebase
git commit -m "feat(firebase): add deny-by-default rules with registry-driven cross-user tests"
```

---

### Task 8: Ledger ports, use cases and fakes

**Files:**
- Create: `packages/application/src/ports/{clock,id-generator,hasher,logger,account-repository,ledger-writer,ledger-reader}.ts`, `packages/application/src/use-cases/{post-transaction,reverse-and-replace,record-opening-balance,create-account}.ts`, `packages/application/src/testing/{in-memory-ledger,ledger-contract}.ts`, tests beside the use cases

**Interfaces:**
- Consumes: Tasks 2 to 4.
- Produces (`ownerId: OwnerId` first on every method):
  - `Clock.nowMs(): number`, `IdGenerator.newId(): string`, `Hasher.sha256(text: string): string`, `Logger.{info,warn,error}(event: string, fields: LogFields): void`
  - `AccountRepository.create(ownerId, record: AccountRecord): Promise<void>`, `.getMany(ownerId, ids): Promise<AccountRecord[]>`, with `AccountRecord = { id; kind: RealAccountKind; name; currency; status: 'active' | 'closed'; createdAtMs }`
  - `LedgerWriter.commit(ownerId, c: LedgerCommit): Promise<LedgerCommitResult>`
  - `LedgerWriter.commitCorrection(ownerId, c: CorrectionCommit): Promise<LedgerCommitResult>`
  - `LedgerWriter.savePending(ownerId, t: TransactionRecord): Promise<void>`
  - `LedgerReader.getTransaction(ownerId, id): Promise<TransactionRecord | null>`, `.getEntries(ownerId, txId): Promise<EntryRecord[]>`, `.getBalance(ownerId, accountId): Promise<number>`, `.recomputeBalance(ownerId, accountId): Promise<number>`
  - `type LedgerCommit = { idempotencyKey; payloadHash; transaction: TransactionRecord; entries: readonly EntryDraft[]; cutoverMarker?: CutoverMarker }`
  - `type CorrectionCommit = { idempotencyKey; payloadHash; originalTransactionId; reversal: TransactionRecord; reversalEntries: readonly EntryDraft[]; replacement?: { transaction: TransactionRecord; entries: readonly EntryDraft[] } }`
  - `type LedgerCommitResult = { status: 'committed' | 'duplicate'; transactionId: TransactionId } | { status: 'idempotencyConflict' }`
  - `canonicalPayload(entries, occurredAtMs, extra?): string`, deterministic JSON hashed for `payloadHash`
  - `PostTransaction.execute({ ownerId, idempotencyKey, transactionId, intent, occurredAtMs, sourceEventIds, actor }): Promise<LedgerCommitResult>`
  - `ReverseAndReplace.execute({ ownerId, idempotencyKey, originalTransactionId, replacement: PostingIntent | null, actor, rationale }): Promise<LedgerCommitResult>`
  - `RecordOpeningBalance.execute({ ownerId, accountId, amount: Money, effectiveAtMs, actor }): Promise<LedgerCommitResult>`, with idempotency key `opening:<accountId>` and transaction ID `opening-<accountId>`
  - `CreateAccount.execute({ ownerId, kind, name, currency }): Promise<{ accountId }>`
  - `TransactionRecord` and `EntryRecord` mirror the Task 5 `transactions` and `ledgerEntries` schemas. `LogFields = Record<string, string | number | boolean>`
  - `describeLedgerContract(name, makeHarness)`, exported from `@moneytrace/application/testing`, with `makeHarness(): Promise<{ writer: LedgerWriter; reader: LedgerReader; accounts: AccountRepository }>`

`PostTransaction` flow: compute entries with `defaultPostingPolicy`, then check every real account against `AccountRepository.getMany`. Any missing account, closed account, or mismatch in `kind` or `currency` throws `DomainError('accountInvalid')` before any write. Then call `LedgerWriter.commit`.

`LedgerWriter.commit` runs `assertBalanced` when entries are non-empty, applies `assertTransition(existingState, 'posted')`, and writes atomically. Empty `entries` are legal only with a `cutoverMarker`.

- [ ] **Step 1: Write the failing contract suite**

`describeLedgerContract` asserts these, and `in-memory-ledger.test.ts` runs it against the fake:

```ts
it('commits entries and updates balances together', async () => { /* withdrawal: bank -X, cash +X */ });
it('returns duplicate for a repeated key and payload, and moves balances once', async () => {
  const first = await writer.commit(owner, commit);
  const again = await writer.commit(owner, commit);
  expect(again).toEqual({ status: 'duplicate', transactionId: first.transactionId });
  expect(await reader.getBalance(owner, cash.id)).toBe(500_000);
});
it('returns idempotencyConflict for the same key with a different payload', async () => {
  await writer.commit(owner, commit);
  const other = await writer.commit(owner, { ...otherCommit, idempotencyKey: commit.idempotencyKey });
  expect(other).toEqual({ status: 'idempotencyConflict' });
  expect(await reader.getEntries(owner, otherCommit.transaction.id)).toEqual([]);
});
it('scopes idempotency by owner', async () => {
  expect((await writer.commit(alice, commit)).status).toBe('committed');
  expect((await writer.commit(bob, commit)).status).toBe('committed');
});
it('a pending transaction has no entries and no balance effect', async () => { /* savePending, balance 0 */ });
it('posting a pending transaction reuses its id and counts once', async () => { /* then balance X, one state */ });
it('rejects an unbalanced commit and writes nothing', async () => { /* balance and transaction unchanged */ });
it('correction reverses and replaces atomically, keeping the original', async () => {
  // original state reversed, entries still present; reversal and replacement linked; balance reflects the replacement only
});
it('rejects reversing a transaction that is already reversed', async () => { /* invalidTransition; balances unchanged */ });
it('rejects reversing a pending or rejected transaction', async () => { /* invalidTransition */ });
it('a second opening marker for an account with a different payload conflicts', async () => { /* idempotencyConflict */ });
it('balance projection equals a recompute from entries', async () => { /* after mixed commits */ });
```

Use-case tests with the fake:
- `PostTransaction`: missing, closed, wrong-kind and wrong-currency accounts each throw `accountInvalid` with nothing written. Another owner's account ID is treated as missing.
- `ReverseAndReplace`: a blank `rationale` throws `invalidIntent`. The reversal keeps `actor` and `rationale`. A second call with a new key on the same original throws `invalidTransition`, and reversing the reversal itself is rejected. `replacement: null` is a pure reversal.
- `RecordOpeningBalance`: same values twice returns `duplicate`. A different amount or date returns `idempotencyConflict`. A zero amount writes the marker with no entries. Gate 33 is asserted through `ReverseAndReplace` here.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/application`
Expected: FAIL.

- [ ] **Step 3: Implement ports, fakes and use cases**

The in-memory fake does all checks and writes synchronously inside each `async` method, so each call is atomic, like a Firestore transaction. Add a `./testing` subpath to the `application` package's `exports`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/application && pnpm boundaries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application
git commit -m "feat(application): add ledger ports, use cases and shared contract suite"
```

---

### Task 9: Firestore ledger adapters

**Files:**
- Create: `packages/infrastructure/src/firestore/{paths,firestore-account-repository,firestore-ledger-writer,firestore-ledger-reader}.ts`, `packages/infrastructure/src/system/{system-clock,crypto-id-generator,node-hasher,json-logger}.ts`, `packages/infrastructure/test/firestore-ledger.emulator.test.ts`, `packages/infrastructure/src/system/json-logger.test.ts`

**Interfaces:**
- Consumes: Task 8 ports and `describeLedgerContract`. Task 5 schemas.
- Produces: `FirestoreLedgerWriter`, `FirestoreLedgerReader`, `FirestoreAccountRepository`, each with `constructor(db: Firestore, clock: Clock)`. Also `SystemClock`, `CryptoIdGenerator`, `NodeHasher`, `JsonLogger(sink: (line: string) => void)`, and `ownerPath(ownerId, collection: OwnerCollectionName, id?)`.

- [ ] **Step 1: Write the failing tests**

```ts
describeLedgerContract('firestore', async () => makeFirestoreHarness());
it('gate 26: card purchase and partial repayment commit atomically', async () => { /* bank, card, expense balances */ });
it('ten parallel commits with one key produce one transaction', async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => writer.commit(owner, commit)));
  expect(results.filter((r) => r.status === 'committed')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(9);
  expect(await reader.getBalance(owner, cash.id)).toBe(500_000);
});
it('two parallel corrections of one transaction: exactly one wins', async () => {
  const results = await Promise.allSettled([correct('key-a'), correct('key-b')]);
  expect(results.filter((r) => r.status === 'fulfilled' && r.value.status === 'committed')).toHaveLength(1);
  expect(await reader.getBalance(owner, cash.id)).toBe(expectedOnce);
});
it('a failure during commit leaves no partial writes', async () => {
  // entry for a transaction whose state forbids posting: entries, balances, idempotency record all absent
});
it('every stored document validates against its contract schema', async () => { /* parse after commit */ });
```

`json-logger.test.ts`: allowlisted fields (`correlationId, ownerId, stage, status, durationMs, errorCode, sourceEventId, transactionId, providerId, attempt`) are emitted as one JSON line. A field such as `rawText: 'Tk 5000 a/c 1234'` is absent from the line, and `droppedFieldCount` is 1.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm firebase emulators:exec --project demo-moneytrace --only firestore "vitest run --config vitest.emulator.config.ts packages/infrastructure/test/firestore-ledger"`
Expected: FAIL.

- [ ] **Step 3: Implement the adapters**

`commit` uses one `db.runTransaction`, with all reads first: idempotency record (doc ID `ledger:<key>`), transaction, balances, cutover marker. Entries use `tx.create` with ID `<transactionId>:<seq>`, so an entry can never be overwritten. All IDs and paths go through `ownerPath`.

`commitCorrection` reads the original transaction inside the transaction, so concurrent corrections conflict and retry into `invalidTransition`.

- [ ] **Step 4: Run to verify pass**

Run the Step 2 command, then `pnpm vitest run packages/infrastructure && pnpm boundaries`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure
git commit -m "feat(infrastructure): add atomic Firestore ledger adapters and JSON logger"
```

---

### Task 10: Pipeline claim protocol

**Files:**
- Create: `packages/application/src/ports/source-event-repository.ts`, `packages/application/src/pipeline/{timeouts,run-stage}.ts`, `packages/application/src/testing/{in-memory-source-events,source-event-contract}.ts`, `packages/infrastructure/src/firestore/firestore-source-event-repository.ts`, `packages/infrastructure/test/firestore-source-events.emulator.test.ts`, unit tests beside `run-stage`

**Interfaces:**
- Consumes: Task 4 statuses and stages.
- Produces:
  - `PIPELINE_TIMEOUTS = { callTimeoutMs: 60_000, functionExecutionTimeoutMs: 120_000, leaseMs: 180_000, maxAttempts: 3 }`
  - `SourceEventRepository.create(ownerId, input): Promise<{ status: 'created' | 'duplicate'; sourceEventId }>`
  - `.get(ownerId, id): Promise<SourceEventRecord | null>`
  - `.claim(ownerId, id, stage, workerId, nowMs): Promise<{ status: 'claimed'; claim: StageClaim } | { status: 'notClaimable'; reason: 'wrongStatus' | 'liveClaim' | 'notFound' }>`
  - `.commitStage(ownerId, claim, commit: StageCommit): Promise<'committed' | 'staleClaim'>`
  - `.listExpiredClaims(nowMs, limit): Promise<ExpiredClaim[]>` (collection group across owners, returns `ownerId` per row)
  - `.reopen(ownerId, id, expectedVersion, nowMs): Promise<'reopened' | 'stale'>`
  - `.park(ownerId, id, expectedVersion, parking: Parking, nowMs): Promise<'parked' | 'stale'>`
  - `type StageClaim = { sourceEventId; stage; workerId; version; stageAttempt; leaseExpiresAtMs }`
  - `type StageCommit = { nextStatus: SourceEventStatus; pendingReason?: PendingReason; deadLetterReason?: DeadLetterReason; outputs: readonly StageOutput[] }`
  - `type StageOutput = { collection: OwnerCollectionName; docId: string; data: Record<string, unknown> }`
  - `type Parking = { status: 'pending'; reason: PendingReason } | { status: 'deadLetter'; reason: DeadLetterReason }`
  - `stageOutputId(sourceEventId, stage, kind): string`
  - `runStage(deps, { ownerId, sourceEventId, stage, workerId, work }): Promise<{ status: 'completed' | 'skipped' | 'staleClaim' | 'leftForRecovery' }>`, where `work(claim): Promise<StageCommit | 'retryLater'>`
  - `describeSourceEventContract(name, makeHarness)`

`type ExpiredClaim = { ownerId; sourceEventId; stage; version; stageAttempt }`. `SourceEventRecord` mirrors the Task 5 schema.

`commitStage` sets `terminalAtMs` when `isTerminal(nextStatus)`. `park` records the stage in `parkedStage` and clears the claim. `reopen` increments `stageAttempt`, clears the claim and `parkedStage`, and restores the input status of `claim.stage ?? parkedStage`, which is what re-fires the Phase 1 trigger.

- [ ] **Step 1: Write the failing tests**

Contract suite, run on the fake and on Firestore:

```ts
it('claims when the status matches and no claim is live', async () => { /* claimed, version + 1 */ });
it('refuses a stage whose input status does not match', async () => { /* reason wrongStatus */ });
it('refuses while a live claim exists', async () => { /* reason liveClaim */ });
it('allows a new claim after reopen, with a higher stageAttempt', async () => { /* attempt 1 */ });
it('reopens a parked event at the stage it was parked from', async () => { /* park at interpret; reopen; status normalized */ });
it('a late worker commit after reopen is staleClaim and writes no outputs', async () => {
  const { claim: old } = await repo.claim(owner, id, 'normalize', 'w1', t0);
  await repo.reopen(owner, id, old.version, t0 + PIPELINE_TIMEOUTS.leaseMs + 1);
  expect(await repo.commitStage(owner, old, commitWith(followUpOutput))).toBe('staleClaim');
  expect(await readFollowUps(owner)).toHaveLength(0);
});
it('lists an expired claim and not a live one', async () => { /* boundary: leaseExpiresAtMs === nowMs counts as expired */ });
it('commit writes outputs, next status and claim release together', async () => { /* all or none */ });
it('sets terminalAtMs only on a terminal status', async () => { /* pending: null; posted: set */ });
it('source hash and idempotency key are owner-scoped', async () => {
  expect((await repo.create(alice, input)).status).toBe('created');
  expect((await repo.create(bob, input)).status).toBe('created');
  expect((await repo.create(alice, input)).status).toBe('duplicate');
});
```

Emulator only:

```ts
it('ten parallel workers: one runs the work and one follow-up exists', async () => {
  let invocations = 0;
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    runStage(deps, { ownerId, sourceEventId, stage: 'match', workerId: `w${i}`, work: async () => { invocations++; return commitWith(followUpOutput); } })));
  expect(invocations).toBe(1);
  expect(results.filter((r) => r.status === 'completed')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'skipped')).toHaveLength(9);
  expect(await readFollowUps(ownerId)).toHaveLength(1);
});
```

`run-stage.test.ts`: `PIPELINE_TIMEOUTS` ordering holds (`callTimeoutMs < functionExecutionTimeoutMs < leaseMs`). `work` throwing leaves the claim for recovery, and returns `leftForRecovery` with nothing committed. `'retryLater'` also returns `leftForRecovery`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/application/src/pipeline packages/application/src/testing && pnpm firebase emulators:exec --project demo-moneytrace --only firestore "vitest run --config vitest.emulator.config.ts packages/infrastructure/test/firestore-source-events"`
Expected: FAIL.

- [ ] **Step 3: Implement the port, fake, adapter and `runStage`**

Every adapter write is a `runTransaction` that re-reads `version`. Treat `leaseExpiresAtMs <= nowMs` as expired in every method, so the boundary behaves the same everywhere. `create` writes the event and `idempotencyRecords` entries for both `source:<idempotencyKey>` and `hash:<sourceHash>` in one transaction.

- [ ] **Step 4: Run to verify pass**

Run the Step 2 command.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application packages/infrastructure
git commit -m "feat: add pipeline claim protocol with lease recovery primitives"
```

---

### Task 11: ProviderCall protocol, quota and cost metering

**Files:**
- Create: `packages/application/src/ports/{provider-call-repository,quota-ledger,ai-usage-recorder}.ts`, `packages/application/src/pipeline/{provider-call-executor,recover-expired-claims,retry-provider-call,purge-provider-results,summarize-ai-usage}.ts`, `packages/application/src/testing/{in-memory-provider-calls,in-memory-quota,fake-provider,provider-call-contract}.ts`, `packages/infrastructure/src/firestore/{firestore-provider-call-repository,firestore-quota-ledger,firestore-ai-usage-recorder}.ts`, `packages/infrastructure/test/firestore-provider-calls.emulator.test.ts`, unit tests beside each pipeline file

**Interfaces:**
- Consumes: Task 4 `nextProviderAction`, Task 10 repository and timeouts.
- Produces:
  - `type ProviderOutcome<T> = { kind: 'success'; value: T; actualMicroUsd?: number } | { kind: 'definiteFailure'; code: string } | { kind: 'unknown'; code: string }`
  - `ProviderCallRepository.getOrCreate(ownerId, key: ProviderCallKey, retrySafety): Promise<ProviderCallRecord>`, with ID and `requestKey` derived from `key = { sourceEventId, stage, providerId }`
  - `.approveRetry(ownerId, id, nowMs)` persists `userApprovedRetry = true`, so the approval survives until the next worker runs
  - `.beginAttempt(ownerId, id, { reservationId? }, nowMs)` increments `attemptCount`, and when `userApprovedRetry` is set it clears that flag and sets `retriedAfterUnknown = true`
  - `.markSucceeded(ownerId, id, result, nowMs)`, `.markFailed(ownerId, id, code, nowMs)`, `.markUnknown(ownerId, id, code, nowMs)`
  - `.listForStage(ownerId, sourceEventId, stage): Promise<ProviderCallRecord[]>`
  - `.purgeResult(ownerId, id, nowMs): Promise<'purged' | 'blockedNotTerminal'>`, which re-reads the owning event inside its transaction
  - `QuotaLedger.reserve(ownerId, estimateMicroUsd, nowMs, limits: QuotaLimits): Promise<{ status: 'reserved'; reservationId: string } | { status: 'exhausted'; window: 'perRequest' | 'daily' | 'monthly' }>`, `.settle(ownerId, reservationId, actualMicroUsd): Promise<void>`. A `reserved` result also carries `warningsCrossed: ('daily' | 'monthly')[]`, non-empty only on the one reservation that first takes a window to 80% or more of its limit (`warnedAtMs` records this, so the warning fires once per window)
  - `DEFAULT_QUOTA_LIMITS = { perRequestMicroUsd: 50_000, dailyMicroUsd: 500_000, monthlyMicroUsd: 5_000_000 }` (USD 5 per month, per PRD section 12; UTC windows)
  - `AIUsageRecorder.append(ownerId, record): Promise<void>`, `.listForUtcDay(ownerId, day: string): Promise<AIUsageRecord[]>`
  - `summarizeAiUsage(records): { requestCount: number; costMicroUsd: number; timeoutCount: number; timeoutRateBp: number; manualRetryCount: number }`, a pure function. Cost uses `actualMicroUsd` when present, otherwise the estimate. A timeout is `errorCode === 'timeout'`. A manual retry is `userApprovedRetry === true`. An empty list gives all zeros
  - `class ProviderCallExecutor { execute<T>(params: { ownerId; sourceEventId; stage; provider: { id: string; retrySafety: RetrySafety }; estimateMicroUsd: number; invoke(requestKey: string, signal: AbortSignal): Promise<ProviderOutcome<T>> }): Promise<ExecuteResult<T>> }`
  - `type ExecuteResult<T> = { kind: 'result'; value: T; retriedAfterUnknown: boolean } | { kind: 'retryLater' } | { kind: 'awaitUserDecision' } | { kind: 'resultMissing' } | { kind: 'exhausted' } | { kind: 'quotaExhausted'; window: string }`
  - `RecoverExpiredClaims.execute(nowMs, limit): Promise<{ reopened: number; parked: number; deadLettered: number }>`
  - `RetryProviderCall.execute({ ownerId, sourceEventId, stage }): Promise<'reopened' | 'notRetryable'>`, which calls `approveRetry` on the stage's unresolved provider call and reopens the event. It returns `notRetryable` unless the event is parked with `providerOutcomeUnknown` or `providerResultMissing`
  - `PurgeProviderResults.execute(nowMs, policy: RetentionPolicy, limit): Promise<{ purged: number }>`

Executor order: `getOrCreate`; if `state === 'started'`, `markUnknown` first (the previous worker died under this stage); `nextProviderAction`; reserve quota when `estimateMicroUsd > 0`; `beginAttempt` (written **before** the call); `invoke` under `AbortSignal.timeout(callTimeoutMs)`; `markSucceeded` immediately on success. Any thrown error or abort maps to `unknown`. After a failed or unknown outcome, call `nextProviderAction` again to choose the return: `invoke` becomes `retryLater`; `awaitUserDecision` and `exhausted` return as they are, so a `none` provider parks at once rather than waiting out its lease. Quota stays charged for every attempt, and `settle` adjusts it only when the provider reports an actual cost. Append `aiUsage` for every attempt. When `warningsCrossed` is non-empty, log event `quotaWarning` with the window; Phase 1 delivers it to the user.

- [ ] **Step 1: Write the failing tests**

`provider-call-executor.test.ts`, with `FakeProvider` counting calls and scripted outcomes:

```ts
it('reuses a stored result after a lost stage commit and calls the provider once', async () => {
  await executor.execute(params);                 // provider success, stored
  // stage commit is simulated as failed: nothing else is written
  const retry = await executor.execute(params);
  expect(retry).toMatchObject({ kind: 'result', value: 'ok', retriedAfterUnknown: false });
  expect(provider.calls).toBe(1);
});
it('writes the attempt before invoking the provider', async () => { /* in invoke, record state is started */ });
it('sends the same requestKey on every attempt', async () => { /* idempotentKey provider, unknown then success */ });
it('a none provider with an unknown outcome is never retried automatically', async () => {
  provider.script({ kind: 'unknown', code: 'timeout' });
  expect((await executor.execute(params)).kind).toBe('awaitUserDecision');
  expect((await executor.execute(params)).kind).toBe('awaitUserDecision');
  expect(provider.calls).toBe(1);
});
it('a thrown error and a timeout both become unknown', async () => { /* fake clock or short abort */ });
it('a worker that died mid-call is treated as unknown', async () => { /* seed state started, none provider */ });
it('a user-approved retry calls again and marks retriedAfterUnknown', async () => { /* approveRetry persisted; a new executor instance calls once; result.retriedAfterUnknown true; approval is consumed */ });
it('definite failures return retryLater up to maxAttempts, then exhausted', async () => { /* retryLater, retryLater, exhausted; 3 calls */ });
it('does not call the provider when quota is exhausted, and counts no attempt', async () => { /* quotaExhausted */ });
it('charges quota for each attempt, including unknown ones', async () => { /* reserved total */ });
it('a fallback provider gets its own record and does not reuse another provider result', async () => { /* two providerIds */ });
it('a succeeded record with no result is resultMissing and makes no call', async () => { /* calls unchanged */ });
```

`recover-expired-claims.test.ts`:
- `started` plus expired lease on a `none` provider: recorded as `unknown`, event parked `pending` with `providerOutcomeUnknown`, not reopened.
- `succeeded` with no result on a non-terminal event: parked `deadLetter` with `providerResultMissing`, not reopened.
- `started` on `idempotentKey` or `localPure`: reopened with a higher attempt.
- No provider call on the stage: reopened.
- `stageAttempt` at `maxAttempts`: moved to `deadLetter` with `attemptsExhausted`.
- A late worker's `markSucceeded` after recovery: the result is stored and reused by the next attempt with no second call. The late stage commit is `staleClaim`.

`purge-provider-results.test.ts`, with a fake clock:
- Skipped for `pending` and `deadLetter` events, however old.
- Skipped for a terminal event inside `providerResultDays`.
- Purges past the window: `result` cleared, `state = purged`, `providerResultsPurged = true`.
- `purgeResult` returns `blockedNotTerminal` when the event is not terminal.

`summarize-ai-usage.test.ts`: mixed records give exact counts, cost prefers actual over estimate, `timeoutRateBp` is `2500` for one timeout in four requests, and an empty list gives zeros with no division error.

Contract suite for repository and quota, run on fake and Firestore:
- Quota: the first reservation at or above 80% of the daily limit returns `warningsCrossed: ['daily']`, and the next returns `[]`; per-request limit rejects; daily and monthly limits reject at the boundary (`reserved + estimate > limit`); `settle` adjusts down and up; a new UTC day resets the daily window but not the monthly one; quota is per owner.

Emulator only: ten parallel `reserve` calls that together exceed the daily limit never over-reserve. Lease expiry end to end: claim, seed `started`, advance past `leaseMs`, run `RecoverExpiredClaims`, assert the event is parked.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/application/src/pipeline && pnpm firebase emulators:exec --project demo-moneytrace --only firestore "vitest run --config vitest.emulator.config.ts packages/infrastructure/test/firestore-provider-calls"`
Expected: FAIL.

- [ ] **Step 3: Implement ports, fakes, adapters and use cases as ordered above**

- [ ] **Step 4: Run to verify pass**

Run the Step 2 command.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application packages/infrastructure
git commit -m "feat: add durable provider calls, retry safety, quota and result retention guard"
```

---

### Task 12: Authenticated callables (gate 35)

**Files:**
- Create: `packages/application/src/ports/user-profile-repository.ts`, `packages/application/src/use-cases/bootstrap-user.ts`, `packages/infrastructure/src/firestore/firestore-user-profile-repository.ts`, `apps/functions/{package.json,tsconfig.json,build.mjs}`, `apps/functions/src/{index,composition}.ts`, `apps/functions/src/callable/{create-callable,bootstrap-user,create-account,record-opening-balance}.ts`, `apps/functions/test/callable-auth.emulator.test.ts`, `apps/functions/src/callable/create-callable.test.ts`, `apps/functions/build.test.ts`
- Modify: root `package.json` (`build:functions`, and `test:emulator` adds `functions`)

**Interfaces:**
- Consumes: Task 6 `COMMANDS`, Task 8 use cases, Task 9 adapters.
- Produces:
  - `REGION = 'asia-south2'`
  - `createCallable(contract, handler: (ctx: { ownerId: OwnerId; correlationId: string; deps: Deps }, data) => Promise<Response>)`, always using `timeoutSeconds: 120`, which matches `PIPELINE_TIMEOUTS.functionExecutionTimeoutMs`
  - `composeDeps(db): Deps`, the only place adapters are wired to ports
  - `UserProfileRepository.createIfAbsent(ownerId, defaults): Promise<boolean>` and `BootstrapUser.execute({ ownerId }): Promise<{ created: boolean }>`
  - Callables `bootstrapUser`, `createAccount`, `recordOpeningBalance`

Error mapping: no `request.auth` is `unauthenticated`; schema failure is `invalid-argument`; `DomainError('accountInvalid')` is `not-found`; other `DomainError`s are `failed-precondition` with the code only; `idempotencyConflict` is `already-exists`; anything else is `internal` with no detail, logged by correlation ID. Response bodies are parsed through the contract's response schema before returning.

`build.mjs` bundles `src/index.ts` with esbuild (`platform: node`, `format: esm`, `target: node22`, external `firebase-admin`, `firebase-functions`) to `dist/index.js`. It writes `dist/package.json` with `"main": "index.js"`, `"type": "module"`, `"engines": { "node": "22" }`, and only those two dependencies, pinned to the versions in Tech Stack.

- [ ] **Step 1: Write the failing tests**

`create-callable.test.ts` covers each error mapping above, using a fake handler and a logger spy: the `internal` response never contains the thrown message, and a correlation ID is logged.

`build.test.ts`: after a build, `dist/package.json` contains no `workspace:` string, and `dist/index.js` contains no `@moneytrace/` import.

`callable-auth.emulator.test.ts` calls the emulator over HTTP at `http://127.0.0.1:5001/demo-moneytrace/asia-south2/<name>` with body `{ data }`, using ID tokens from the Auth emulator's `accounts:signUp`:

```ts
it('rejects a request with no token', async () => { /* status 401, error.status UNAUTHENTICATED */ });
it('rejects a forged ownerId in the body', async () => {
  const res = await call('createAccount', alice, { kind: 'bank', name: 'City', currency: 'BDT', ownerId: 'bob' });
  expect(res.error.status).toBe('INVALID_ARGUMENT');
  expect(await listAccounts('bob')).toHaveLength(0);
});
it('treats another user account id as not found and changes nothing', async () => {
  const { accountId } = await call('createAccount', alice, validAccount).then(unwrap);
  const res = await call('recordOpeningBalance', bob, { accountId, amountMinor: 100, currency: 'BDT', effectiveAtMs: 1 });
  expect(res.error.status).toBe('NOT_FOUND');
  expect(await balanceOf('alice', accountId)).toBe(0);
});
it.each([12.5, '100', 2 ** 53])('rejects amount %s with no write', async (amountMinor) => { /* INVALID_ARGUMENT */ });
it('records an opening balance, repeats harmlessly, and rejects a changed one', async () => {
  // first: status recorded; same again: alreadyRecorded; different amount: ALREADY_EXISTS; balance unchanged
});
it('bootstrapUser is idempotent', async () => { /* created true, then false; settings kept */ });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/functions`
Expected: FAIL.

- [ ] **Step 3: Implement the callables, composition root and build script**

`BootstrapUser` creates `users/{uid}` with defaults `{ currency: 'BDT', reportingCycle: 'calendarMonth' }` only if absent, through `UserProfileRepository`. Handlers call use cases only and never touch Firestore directly. No secrets exist in this phase.

- [ ] **Step 4: Run the full emulator suite**

Run: `pnpm test:emulator`
Expected: PASS for all emulator tests. If the emulator cannot resolve `firebase-functions` from `dist`, have `build.mjs` run `npm install --omit=dev` inside `dist` (it is gitignored and `node_modules` is ignored at deploy), then re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/functions packages/application packages/infrastructure package.json pnpm-lock.yaml
git commit -m "feat(functions): add authenticated callables with cross-user tests"
```

---

### Task 13: Minimal web sign-in

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,next.config.ts,.env.example,vitest.config.ts}`, `apps/web/src/app/{layout,page}.tsx`, `apps/web/src/features/auth/{auth-gateway,firebase-auth-gateway,AuthGate}.ts(x)`, `apps/web/src/features/auth/AuthGate.test.tsx`, `apps/web/src/shared/firebase.ts`

**Interfaces:**
- Consumes: `COMMANDS.bootstrapUser` types from Task 6.
- Produces:
  - `AuthGateway = { onChange(cb: (user: { uid: string } | null) => void): () => void; signIn(): Promise<void>; signOut(): Promise<void>; bootstrap(): Promise<void> }`
  - `<AuthGate gateway={...}>{children}</AuthGate>`

Google sign-in. `NEXT_PUBLIC_USE_EMULATORS=1` connects Auth and Functions to the emulators. `.env.example` lists the public Firebase config keys only.

- [ ] **Step 1: Write the failing tests**

With a fake gateway, using Testing Library and jsdom, add `@testing-library/react` 16.3.3, `jsdom` 31.0.0, `@vitejs/plugin-react` 6.2.1:

```tsx
it('shows a keyboard-reachable sign-in button when signed out', async () => { /* role button, focusable */ });
it('shows "Setting up your account" while bootstrap runs, not the app', async () => { /* children absent */ });
it('shows children only after bootstrap succeeds', async () => { /* children present */ });
it('shows a failure message with a retry when bootstrap fails, and never the app', async () => { /* role alert; retry re-calls */ });
it('shows a failure message when sign-in is rejected', async () => { /* role alert */ });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement `AuthGate`, the gateway and a placeholder page**

The page shows "Signed in" and a sign-out button. `next.config.ts` sets `transpilePackages: ['@moneytrace/contracts']`.

- [ ] **Step 4: Verify tests and build**

Run: `pnpm vitest run apps/web && pnpm --filter web build && pnpm boundaries`
Expected: PASS, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml package.json
git commit -m "feat(web): add sign-in gate that reports bootstrap state honestly"
```

---

### Task 14: CI, documentation and agent guide

> Amended by PRD CR-002: documentation is Phase 0A. The CI workflow and Step 5's push are Phase 0B.

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/GLOSSARY.md`, `docs/adr/0002-integer-money-and-nominal-accounts.md`, `docs/adr/0003-functions-bundling.md`, `docs/adr/0004-region.md`
- Modify: `AGENT.md` (Project status, Commands, Repository layout), `README.md`

- [ ] **Step 1: Write the CI workflow**

One job on `pull_request` and pushes to `master`: Node 22, Temurin Java 21, pnpm via corepack, frozen-lockfile install, `pnpm verify`, `pnpm --filter web build`, `pnpm test:emulator`. Cache `~/.cache/firebase/emulators`.

- [ ] **Step 2: Write the documents**

- `GLOSSARY.md`: Account, nominal account, PaymentInstrument, SourceEvent, Transaction, LedgerEntry, claim, lease, ProviderCall, retry safety, cutover marker, custody, and the two meanings of pending.
- ADR 0002: `number` with safe-integer checks rather than `bigint` (Firestore stores numbers; the safe limit is about 90 trillion taka), and why nominal accounts exist.
- ADR 0003: bundling Functions with esbuild because Cloud Build cannot resolve `workspace:` dependencies.
- ADR 0004: Firestore, Functions and Storage all in `asia-south2`. Delhi is geographically closer to Bangladesh than Mumbai, though real latency was not measured because a connect test only reaches the nearest Google edge. Firebase's location page lists `asia-east2` as the nearest Functions region for both India Firestore regions, but also lists `asia-south2` as a 2nd-gen Functions region and does not require co-location; same-region placement avoids cross-region latency and cost. The Task 15 smoke test is what confirms it works.
- `AGENT.md`: replace the placeholder Commands and Repository layout with real ones, set status to "Phase 0 in progress", link the spec and this plan, and add the Java 21 and TypeScript 6.0.3 notes. Edit `AGENT.md` only; `CLAUDE.md` is a symlink to it.

- [ ] **Step 3: Verify everything locally**

Run: `pnpm verify && pnpm --filter web build && pnpm test:emulator`
Expected: all pass. Paste the summary lines into the task report.

- [ ] **Step 4: Commit**

```bash
git add .github docs AGENT.md README.md
git commit -m "ci: run lint, boundaries, tests and emulator suite on every PR"
```

- [ ] **Step 5: Ask Mabrur before pushing**

Pushing to `origin` (`git@github.com:my-dad/MoneyTrace.git`) publishes the branch and starts CI. Local `master` also has unpushed commits. Ask first, then report CI's actual result.

---

### Task 15: Environments, backups and restore drill

> Amended by PRD CR-002: Steps 1 to 3 are Phase 0A. Steps 4 onward are the Phase 0B deployment gate, and also need the controls in `docs/runbooks/firebase-environments.md`.

Steps marked **Mabrur** need their Google account, billing or decisions. Everything else can be prepared by an agent. These steps create real resources, so nothing runs without Mabrur's go-ahead, and the Firestore location cannot be changed afterward.

**Files:**
- Create: `.firebaserc`, `apps/functions/src/smoke-index.ts`, `docs/runbooks/firebase-environments.md`, `docs/runbooks/restore-drill.md`, `docs/runbooks/restore-drill-log.md`, `tools/restore-drill/{drill.ts,checksum.ts,checksum.emulator.test.ts}`
- Modify: root `package.json` (`drill:seed`, `drill:verify`, `deploy:staging`)

**Interfaces:**
- Consumes: Task 9 adapters, Task 8 use cases, Task 5 `OWNER_DATA_REGISTRY`, `userProfileSchema` and `deletionLogEntrySchema`.
- Produces:
  - `dataChecksum(db, ownerId): Promise<DataChecksum>`, with `DataChecksum = { collections: Record<OwnerCollectionName, { count: number; sha256: string }>; profileSha256: string; deletionLogSha256: string }`. Each hash covers canonical JSON of the documents sorted by ID, so a changed field is detected as well as a missing document. The list of collections comes from `OWNER_DATA_REGISTRY`, never a hand-written list.
  - `diffChecksums(expected, actual): string[]`, naming each scope that differs. Empty means a match.

- [ ] **Step 1: Write the failing checksum test**

`checksum.emulator.test.ts`:

```ts
it('seeds at least one valid document in every registered collection', async () => {
  await seed(db);
  const sum = await dataChecksum(db, DRILL_OWNER);
  for (const name of Object.keys(OWNER_DATA_REGISTRY)) expect(sum.collections[name].count, name).toBeGreaterThan(0);
});
it.each(Object.keys(OWNER_DATA_REGISTRY))('detects a lost document in %s', async (name) => {
  const expected = await dataChecksum(db, DRILL_OWNER);
  await deleteOneDoc(DRILL_OWNER, name);
  expect(diffChecksums(expected, await dataChecksum(db, DRILL_OWNER))).toEqual([name]);
});
it.each(Object.keys(OWNER_DATA_REGISTRY))('detects a changed field in %s', async (name) => { /* same, updating one field */ });
it('detects a lost profile and a lost deletion-log entry', async () => { /* scopes profile and deletionLog */ });
it('the same data gives an identical checksum', async () => { /* two runs are equal */ });
```

**The drill must refuse a project ID other than one ending in `-staging`, or `demo-moneytrace`.** Test that refusal.

- [ ] **Step 2: Implement `drill.ts` and verify**

Add `tsx` as a root dev dependency to run the script. `drill seed` posts fixed ledger transactions through the use cases as owner `restore-drill`, writes one schema-valid document with fixed values to each remaining registered collection, plus the profile and one `deletionLog` entry, then writes the checksum to `--expected <path>`. It fails if any registered collection has no seed. `drill verify --database <id> --expected <path>` recomputes against the restored database, prints `diffChecksums` and exits non-zero on any difference. It also asserts that each balance equals a recompute from restored `ledgerEntries`. The checksum file holds only counts and hashes.

Run: `pnpm test:emulator`
Expected: PASS.

- [ ] **Step 3: Write the runbooks**

`firebase-environments.md` covers each step below with exact commands. `restore-drill.md` covers the drill with expected output.

- [ ] **Step 4: Mabrur: create staging only, and prove the region**

Create the staging project (suggested ID `moneytrace-staging`; IDs are global, so it may be taken). Upgrade to Blaze, which Functions and backups require. Create Firestore and the Storage bucket in `asia-south2`. If either does not offer it, stop and tell the agent. Enable Google sign-in. Provide the project ID, then an agent writes `.firebaserc` with alias `staging`.

An agent prepares `smoke-index.ts`, which re-exports the real callables plus two temporary functions in `asia-south2`: `smokeOnWrite` (`onDocumentWritten` on `smokeTests/{id}`, writes `smokeResults/{id}` with the delay in ms) and `smokeSchedule` (every 5 minutes, logs `smokeScheduleRan`). `build.mjs --smoke` uses this entry point. Normal builds never include it.

Mabrur runs `pnpm build:functions --smoke`, deploys to staging, creates a document in `smokeTests` from the console, and waits 10 minutes.

Expected: deploy succeeds, `smokeResults/<id>` appears, and `smokeScheduleRan` is in the logs. Record the delay and the result in ADR 0004. **If the trigger or schedule cannot be deployed in `asia-south2`, stop.** Staging can be replaced, so bring the error to Mabrur before any other database is created. The fallback to evaluate is the same database with Functions in `asia-east2`, as Firebase's mapping table suggests.

Deploy normally afterward to remove the smoke functions.

- [ ] **Step 5: Mabrur: create dev and prod, and set budgets**

Only after Step 4 passes, create `moneytrace-dev` and `moneytrace-prod` the same way, and an agent adds their aliases to `.firebaserc`. In Cloud Billing, add budget alerts on each project. Alerts notify; they do not cap spending. Confirm the `_Default` Cloud Logging bucket retention is 30 days in each project. That setting covers operational logs only; accounting records stay in Firestore and are unaffected.

- [ ] **Step 6: Mabrur: deploy to staging and configure backups**

```bash
pnpm firebase login
pnpm deploy:staging    # build:functions, then firebase deploy --project staging --only firestore,storage,functions
pnpm firebase firestore:databases:update "(default)" --project staging --point-in-time-recovery ENABLED
pnpm firebase firestore:backups:schedules:create --project staging --recurrence DAILY --retention 14d
```

Expected: deploy succeeds, and `pnpm firebase firestore:backups:schedules:list --project staging` shows the schedule. Check flags with `--help` first. Repeat the backup commands for `prod`.

- [ ] **Step 7: Mabrur: run the first restore drill**

`drill.ts` uses Application Default Credentials, so this needs `gcloud auth application-default login` (gcloud is not installed yet) or a staging service account key that is never committed. Run `pnpm drill:seed --project staging --expected drill-expected.json`, wait for a daily backup, then restore it with `firebase firestore:databases:restore` into database `restore-drill`, run `pnpm drill:verify --project staging --database restore-drill --expected drill-expected.json`, and delete that database. Expected: no differences in any collection.

Firestore backups do not include Storage or Auth, so the drill covers them separately:
- **Auth:** `ownerId` is the Auth UID, so restored data is unreachable if the user record is lost. Run `firebase auth:export` to a path outside the repo, confirm a test user's UID is present, then delete the file, because it contains user data. The runbook documents the export as the only Auth copy, and that nothing in Phase 0 schedules it. Add scheduling to the Phase 4 hardening list.
- **Storage:** not restored, by design, because originals are ephemeral. The runbook states that a restored `temporaryUploads` record may point at a file that no longer exists, and that the event then asks for a new upload, as spec section 5 stage 7 requires.

Record date, backup ID, per-collection result and the Auth check in `restore-drill-log.md`.

- [ ] **Step 8: Mabrur: require CI on `master`**

Spec section 7 makes these tests merge-blocking, and only a branch protection rule enforces that. Availability depends on the GitHub plan for `my-dad/MoneyTrace`. If it is not available, record that in the runbook as a known gap.

- [ ] **Step 9: Commit**

```bash
git add .firebaserc apps/functions docs/runbooks docs/adr tools/restore-drill package.json pnpm-lock.yaml
git commit -m "chore: add environment runbooks and a verified restore drill"
```

---

## Phase 0 exit checklists

Split by PRD CR-002. Run the commands and report the real output.

### Phase 0A: local foundations

Exit gate: **security and accounting tests green locally, and reviews complete.** Phase 1 may start after this.

- [ ] `pnpm verify` passes.
- [ ] `pnpm --filter web build` passes.
- [ ] `pnpm test:emulator` passes.
- [ ] Every task has a completed independent review, and the whole-branch review is done with findings resolved or recorded.
- [ ] These spec section 8 items exist: schemas and indexes (Tasks 5, 7), contracts (Task 6), rules (Task 7), `ConfidencePolicy` rules and config (Tasks 4, 5), claim and `ProviderCall` code with concurrency and failure-injection tests (Tasks 10, 11), `RetentionPolicy` and `OwnerDataRegistry` with their test (Task 5), restore drill tooling tested on the emulator (Task 15 Steps 1 to 3), boundary-tool ADR (Task 1).
- [ ] Open items for Phase 1 are written down: whether DeepSeek honors idempotency keys, which sets its `retrySafety`; a review of AI data-processing terms (PRD section 10); the Task 5 follow-ups (profile timezone, `sourceEvents` retained text and provenance, `transactions` category); and the Phase 1 trigger firing on `version` change.

### Phase 0B: deployment gate

Exit gate: **all of the below, before any deployment, real financial data, or the user pilot.** It does not block Phase 1 work on emulators.

- [ ] Every control in `docs/runbooks/firebase-environments.md` is met, including App Check, rate limits, Function limits, separate projects, least-privilege access, spending controls and the abuse checklist.
- [ ] Blaze enabled, and the staging smoke test passed in `asia-south2`, with the result recorded in ADR 0004.
- [ ] `dev` and `prod` created only after that smoke test passed.
- [ ] Composite indexes deployed and confirmed on a real project, since the emulator does not enforce them.
- [ ] Backups configured, and the first restore drill matched for every registered collection, the profile and the deletion log, with the Auth and Storage boundaries documented.
- [ ] CI runs `pnpm verify`, the web build and `pnpm test:emulator`, is green on the pushed branch, and is merge-blocking where the GitHub plan allows.
