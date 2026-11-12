# Sources from SMS (CR-008, piece 2): progress

Plan: `docs/superpowers/plans/2026-11-12-sources-from-sms.md`. Spec: `docs/superpowers/specs/2026-11-12-sources-from-sms-design.md`.
Branch `sources-from-sms`, from `master` (`578d56a`). Executor: Native. Read this file first when resuming.

| Task | State |
|---|---|
| 1 Mockup H | Done: approved by Mabrur 2026-11-12, with quick answers kept |
| 2 Contracts | Done |
| 3 Sources remembered from SMS | Done |
| 4 Transfer pairing | Done |
| 5 DeepSeek asks until it's clear | Done |
| 6 Web: chips, Net money and Sources, question thread | Done |
| 7 End-to-end tests, final checks, records | Done |

## Final review

Done (fresh reviewer, whole branch): 1 Critical and 9 Important, plus 2 Minors re-graded up. All fixed test-first except the "not a transfer" undo (spec §9), which is Mabrur's call. 9 Minors deferred.

## Next task

Mabrur decides on the "not a transfer" undo, then chooses how to integrate `sources-from-sms`.

## Last verification

2026-11-13, after the review fixes: `pnpm verify` 84 files / 1,394 tests; web build passes; `pnpm test:emulator` 445 + 26; `pnpm test:e2e` 1 passed; `pnpm test:e2e:fixture` 4 passed.

## Open items

- Piece 3 (tips from DeepSeek) and piece 4 (going live: 0B gate, DeepSeek terms, Mabrur sets the key himself).
- The real DeepSeek prompt (`interpret-v2`) has only been exercised with scripted and fake providers; check it against real SMS before relying on its questions (piece 4).

## Open decisions

None. Quick answers were added to the plan (an optional `options` list on DeepSeek's question).

## Mockup differences

- Recent rows repeat the source name in the detail line as well as in the chip.
