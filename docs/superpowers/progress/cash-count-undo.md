# Cash count and transfer undo: progress

Plan: `docs/superpowers/plans/2026-11-13-cash-count-and-transfer-undo.md`. Spec: mockup I, `design/screens/I-cash-count-undo.html` (approved by Mabrur 2026-11-13).
Branch `cash-count-undo`, from `master` (`8ef6d5f`). Executor: Native. Read this file first when resuming; the detailed ledger is `.superpowers/sdd/2026-11-13-cash-count-and-transfer-undo/progress.md`.

| Task | State |
|---|---|
| 1 Contracts and records | Done |
| 2 Ledger: extra posting in a correction | Done |
| 3 Record a cash count | Done |
| 4 Adjust to the count | Done |
| 5 Split a paired transfer | Done |
| 6 Callables | Done |
| 7 Web: cash count | Done |
| 8 Web: Not a transfer | Not started |
| 9 E2E, final checks, records | Not started |

## Next task

Task 8.

## Decisions

- CR-009 (open sign-up for friends and family) accepted 2026-11-13; built after this plan, in its own plan.

## Mockup differences

- Adjust note drops "you can correct it later" (no correction UI yet).
- "Cash is now ৳X" becomes "Cash now matches your count of ৳X".
