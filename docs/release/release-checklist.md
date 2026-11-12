# Release blockers

Everything that must be true before MoneyTrace holds real financial data. Sources: PRD §14 (release gates), §16 (0B gate), §18 (definition of done), and `docs/runbooks/firebase-environments.md`. Tick an item only with evidence (a commit, a test run, or a dated note).

Owner: **Code** = buildable here and verified by tests. **Mabrur** = needs his Google, billing or DeepSeek account. **Together** = Mabrur runs it while we check the result.

## A. Access and abuse (code)

- [ ] A1 **Only Mabrur can use it.** Every callable rejects any account not on a server-side allowlist (`ALLOWED_EMAILS`, kept out of the public repo). With no allowlist set, a deployment rejects everyone (fails closed). — Code
- [ ] A2 **Google sign-in only.** Outside the emulator, the server rejects anonymous or other providers (`sign_in_provider` must be `google.com`) and unverified emails. — Code
- [ ] A3 **App Check enforced** on every deployed callable, and initialised in the web app with a reCAPTCHA Enterprise site key from configuration. — Code (site key: Mabrur, D4)
- [ ] A4 **Per-user and per-IP rate limits** on callables, with tests. — Code
- [ ] A5 **Function limits:** max instances, concurrency, memory and timeout set conservatively on every function. — Code
- [ ] A6 **Sign-in works installed on a phone:** fall back to redirect when the pop-up is blocked or the app runs standalone. — Code, checked on a real phone in E3

## B. Delivery (code)

- [ ] B1 **Web hosting:** the web app builds to a deployable target and `firebase.json` serves it, with the PWA files. — Code (choice: Firebase Hosting static export, recommended because it works on the free tier; App Hosting needs Blaze)
- [ ] B2 **CI:** GitHub Actions runs `pnpm verify`, the web build and `pnpm test:emulator` on every PR, and the checks are required on `master`. — Code (branch protection: Mabrur)
- [ ] B3 **Deploy command** `pnpm deploy:staging` (and a prod one) checked for flags and targets. — Code
- [ ] B4 **Release gates 25–36** (except 27, 29, 30, deferred by CR-001) each mapped to a passing test. — Code
- [ ] B5 **"Not a transfer" undo** (CR-008 spec §9): build it, or record it as an accepted gap in CR-008. — Mabrur decides

## C. Accounts and billing (Mabrur)

- [ ] C1 2FA on the Google account; least-privilege Google Cloud access; no service-account keys anywhere.
- [ ] C2 Upgrade to Blaze, with a budget, alerts (invocations, errors, Storage, egress, AI) and a spend cap.
- [ ] C3 DeepSeek data-processing terms read and accepted for real SMS text (CLAUDE.md, security and privacy).
- [ ] C4 DeepSeek key set with `firebase functions:secrets:set DEEPSEEK_API_KEY`. Never pasted into chat.
- [ ] C5 Decide whether a separate dev project is needed, or only staging and prod (the runbook lists all three).

## D. Environments (Together)

- [ ] D1 Staging region smoke test in `asia-south2` (trigger and schedule), with the delay recorded in `docs/adr/0004-region.md`.
- [ ] D2 Prod project created in the approved region; Google sign-in enabled; authorized domains set.
- [ ] D3 Allowlist secret set in staging and prod.
- [ ] D4 App Check registered (reCAPTCHA Enterprise) for staging and prod.
- [ ] D5 Backups and point-in-time recovery on; first restore drill matched (`docs/runbooks/restore-drill.md`).
- [ ] D6 Staging abuse and penetration checklist run (another Google account, no App Check token, a burst of calls, a direct Firestore write).

## E. Pilot (Together)

- [ ] E1 Real SMS from each provider through the deployed parsers and DeepSeek; its questions make sense (`interpret-v2` has only met scripted and fake providers).
- [ ] E2 AI quota, metering and the "DeepSeek down" fallback observed on staging.
- [ ] E3 Installed PWA on Mabrur's phone: sign-in, paste, chat questions, dashboard.

## Not blocking release

- Piece 3, tips from DeepSeek (ships right after launch unless Mabrur says otherwise).
- Receipts and OCR (CR-001); P1 reports, export and deletion, CSV import; push notifications (follow-ups already show in the chat).
- Deferred minors listed in `docs/superpowers/progress/`.
