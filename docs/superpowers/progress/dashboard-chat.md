# Dashboard and pop-up chat (CR-007 piece 1): progress

Plan: `docs/superpowers/plans/2026-11-12-dashboard-chat.md`. Spec: `docs/superpowers/specs/2026-11-12-dashboard-chat-design.md`.
Branch `dashboard-chat`, from `phase-1-sms-slice` (`02fd3ab`). Executor: Native. Read this file first when resuming.

| Task | State |
|---|---|
| 1 Mockup G (dashboard and chat) | Done: approved by Mabrur 2026-11-12, all decisions as drawn |
| 2 Read models, demo clock and data | Done |
| 3 Dashboard view model | Done |
| 4 Recent items | Done |
| 5 Dashboard screen | Done |
| 6 Chat launcher and panel | Done |
| 7 Sign-in page | Done |
| 8 Remove old screens | Done |
| 9 End-to-end tests, final checks, records | Done |

## Next task

Final whole-branch review (fresh reviewer), then the fix pass and finishing the branch.

## Open decisions

None.

## Open items

- Piece 2: accounts created from SMS. Until then a bank SMS can't be matched to an account, so it waits as "Waiting for your answer", and the dashboard stays empty for a real new user.
- Piece 3: tips from DeepSeek (the dashboard reserves an empty spot). Piece 4: going live (0B gate, DeepSeek terms, Mabrur sets the key himself).
- `test:e2e` logs a harmless Secret Manager 403 for `DEEPSEEK_API_KEY` (the fake AI needs no key).
- The CR-003 sign-in hardening question (allowlist, anonymous sign-in, pop-up fallback, for the 0B checklist) is still open with Mabrur.

## Mockup differences

- Recent dates include the weekday ("Thu 5 Nov"); the mockup shows "5 Nov".

## Last verification

Task 9 (2026-11-12): `pnpm verify` 81 files / 1,310 tests, no dependency violations; `pnpm --filter web build` passes; `pnpm test:emulator` 444 + 26; `pnpm test:e2e` 1 passed; `pnpm test:e2e:fixture` 4 passed.
