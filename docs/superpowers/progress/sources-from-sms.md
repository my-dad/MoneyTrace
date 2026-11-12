# Sources from SMS (CR-008, piece 2): progress

Plan: `docs/superpowers/plans/2026-11-12-sources-from-sms.md`. Spec: `docs/superpowers/specs/2026-11-12-sources-from-sms-design.md`.
Branch `sources-from-sms`, from `master` (`578d56a`). Executor: Native. Read this file first when resuming.

| Task | State |
|---|---|
| 1 Mockup H | Done: approved by Mabrur 2026-11-12, with quick answers kept |
| 2 Contracts | Done |
| 3 Sources remembered from SMS | Done |
| 4 Transfer pairing | Done |
| 5 DeepSeek asks until it's clear | Done (emulator run pending) |
| 6 Web: chips, Net money and Sources, question thread | In progress (WIP commit) |
| 7 End-to-end tests, final checks, records | Not started |

## Next task

Resume Task 6 (web). Done in the WIP commit: demo data (transfer event `se-transfer-bkash`, `FIXTURE_SOURCE_ENTRIES`), view model `netMoneyMinor` + `sources` (replacing availableMinor/cardsOwedMinor), `RecentItem.chips`; their tests pass (17/17).
Still to do: `watchSourceEntries` in both gateways; DashboardScreen renders Net money + SourcesList and chips (update its tests: "Banks and cash"/"Cards owed" are gone); `answerQuestion` in `PHASE_ONE_COMMANDS` and the chat's QuestionThread (options, reply box, Skip, OTP refusal copy); then verify. Task 5's emulator run was started; re-run `pnpm test:emulator` to confirm (one earlier run hit a transient 'Failed to load function').

## Open decisions

None. Quick answers were added to the plan (an optional `options` list on DeepSeek's question).
