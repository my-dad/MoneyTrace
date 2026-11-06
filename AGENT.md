# MoneyTrace — Agent Guide

Single source of truth for AI coding agents. `CLAUDE.md` is a symlink to this file. Edit only `AGENT.md`.

Source of product truth: `MoneyTrace_PRD_v1.0.md` (locked MVP baseline). If this file and the PRD disagree, the PRD wins; propose a PRD change rather than silently deviating.

## Project status

Implementation has **not started**. Next artifact is an engineering blueprint (repo modules, Firestore schemas, Cloud Function contracts, rules, AI/OCR adapters, test fixtures, deployment plan). Update the "Commands" and "Repository layout" sections below as soon as real scaffolding exists; do not invent commands that do not exist.

## What it is

Single-user, mobile-first PWA for evidence-driven personal/household finance tracking. The user pastes bank SMS, uploads receipts/screenshots/PDFs, or chats about cash. The system extracts evidence, deduplicates, validates, posts balanced ledger entries, and asks focused follow-up questions. Hybrid home screen: summary + pending items + always-available AI chat.

## Locked tech stack

- Frontend: Next.js + TypeScript (PWA, mobile-first)
- Backend: Firebase Authentication, Cloud Functions (TypeScript), Cloud Firestore
- AI: DeepSeek API behind an `AIProvider` interface. No custom model training.
- OCR: replaceable `OCRProvider` adapter (benchmark Tesseract.js vs managed OCR on real Bangladesh receipts)
- Uploads: private, short-lived Cloud Storage
- Reminders: scheduled backend jobs + FCM/web push; in-app inbox is the reliable fallback
- Currency: BDT first; **integer minor units only**
- Secrets: Secret Manager; no client-side API secrets

Do not swap or add major technologies without recording a change request (see Change control).

## Non-negotiable rules

### Accounting invariants
- Cash withdrawal: bank asset down, cash asset up. **Never an expense.**
- Giving cash to a family member / allocating cash changes custody, not expense.
- Credit-card purchase: expense + liability up. Repayment: bank down + liability down, **not an expense**.
- Debit cards are instruments linked to a bank account, not balance-bearing accounts.
- Card interest/fees are expenses; refunds reverse the relevant effects.
- Every posted transaction has balanced ledger entries, same currency. Ledger is append-only and immutable; corrections are reversal + replacement, atomically, with audit trail.
- Cash count discrepancies are never auto-categorized as spending; adjustments need explicit cause, authorization, audit.
- Never double-count pending authorizations and final postings.
- Opening balances are dated positions, not income/expense; later historical imports must not duplicate them.
- Never use floating point for money. Exact integer arithmetic only.

### AI / OCR boundaries
- AI never gets unrestricted DB access and **cannot directly mutate ledger balances**. It proposes; deterministic backend code validates and posts.
- OCR output is evidence, not accounting truth. Deterministic validation and matching decide.
- Parse known bank SMS patterns deterministically first; AI is the fallback. Unclear cases are explicitly marked for review.
- DeepSeek text API does not take raw images: OCR first.
- AI outputs must be schema-validated. Record model + prompt version and source-event IDs. Keep a regression corpus.
- Provider specifics (auth, model names, JSON handling, metering, timeouts, retries) live only inside adapters.

### Honesty of state
- Chat/UI must report the actual state (recorded / pending / failed). **Never claim success that was not confirmed.**
- Never silently drop uploads. Never post guessed amounts from unreadable receipts.
- Reminder wording must not imply unaccounted cash was necessarily spent.

### Security & privacy
- All ledger writes and third-party API calls go through Cloud Functions. Clients never write the ledger.
- Ownership check on every request; strict Firestore/Storage rules; App Check is supplemental, not authorization.
- Never request or store bank passwords, PINs, or OTPs. Minimize/redact card and account identifiers.
- Receipt originals: restrict size/MIME, store privately, delete after durable structured persistence, verify deletion, retry failures, auto-expire abandoned files.
- Structured logs only: no raw financial documents, no secrets, no PII dumps. Use correlated request IDs.
- Review third-party AI/OCR data-processing terms before sending real financial data.

### Idempotency & resilience
- Postings, reminders, and source-event ingestion must be idempotent and retry-safe (idempotency keys, source hashes).
- Bounded retries with backoff; dead-letter/review state for failures.
- AI quota exhausted or provider down: ledger, balances, reports, reminders, and deterministic parsers keep working; ambiguous evidence goes to a visible pending queue.
- Meter tokens and cost; enforce per-request, daily, monthly quotas (default target USD 5/month, model API only, configurable).

## Domain model (conceptual)

User, Account (bank / cash / family-held cash / credit liability), PaymentInstrument, SourceEvent, Transaction, LedgerEntry (append-only), CashAllocation, Reconciliation, FollowUp, Conversation, AIUsage, TemporaryUpload. See PRD §9 for fields.

## Screens

Home, AI Chat, Activity/Inbox, Accounts & Cash, Reports (calendar month + configurable salary-cycle), Settings/Onboarding. See PRD §4.

## Priorities

P0 (must): auth + data isolation, accounts/cash/cards, opening balances, SMS/chat ingest, AIProvider, receipt OCR pipeline, receipt deletion, dedup, atomic idempotent ledger, correct withdrawal/transfer/card flows, cash tracking, follow-ups, hybrid home, AI metering + fallback.
P1: inbox + reconciliation views, reports, export/deletion, CSV import.
Later: auto SMS collection, email sync, family login, bank APIs, investments.

P1 work must never undermine ledger correctness.

## Delivery phases

0 Foundations (Firebase, auth, rules, ledger invariants, cost monitoring) → 1 SMS vertical slice → 2 Receipt pipeline → 3 Reconciliation & reporting → 4 Hardening/pilot. Each phase has an exit gate (PRD §16). Do not jump ahead of the current phase's gate.

## Testing expectations

- Ledger invariants need regression tests before features build on them (PRD §14 release gates 25–36 are the acceptance suite): ATM withdrawal, card purchase + partial repayment, SMS+receipt dedup into one expense, distinct equal-value purchases not collapsed, unreadable receipt, deletion verification, follow-up scheduling, cash discrepancy, edit via reversal, AI budget exhausted, cross-user isolation, import cutover.
- Use Firebase emulators for rules and function tests; test security rules explicitly for cross-user access.
- Maintain fixtures: bank SMS samples, Bangla/English receipts (thermal, photos, screenshots, PDFs).
- Do not claim a task is done without running the relevant tests and reporting actual output.

## Conventions

- TypeScript strict mode. Validate all external input and all AI output with schemas.
- Money as integer minor units + currency code. No floats, no implicit rounding.
- Keep provider-specific code behind `AIProvider` / `OCRProvider`.
- Accessibility: keyboard-accessible chat, clear status text, adequate contrast, mobile touch targets.
- Slow OCR/AI work runs asynchronously with visible status; acknowledge immediately.
- Prefer small, reviewable changes. Don't add features, abstractions, or dependencies beyond the current phase's scope.

## Commands

_None yet — project not scaffolded._ Fill in install, dev, build, lint, test, emulator, and deploy commands once they exist.

## Repository layout

_To be defined in the engineering blueprint._ Currently: `MoneyTrace_PRD_v1.0.md`, `AGENT.md`, `CLAUDE.md` (symlink).

## Change control

Any change to the locked baseline (scope, stack, invariants) must record: proposed change, rationale, security/cost impact, acceptance criteria. Ask the user before making such a change.
