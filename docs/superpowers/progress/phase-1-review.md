# Phase 1 whole-branch review

Ran 2026-11-12, after Mabrur said "do whats best". Scope: `master..b055b0f` (the SMS slice), graded at `phase-1-sms-slice` HEAD. Reviewer: a fresh reviewer on the most capable model, read-only. Verdict: "with fixes" — 1 Critical, 4 Important, 10 Minor. All rulings in the Phase 1 ledger stand except two (pre-flight "match at paste time" and T7 "confirm clears matchKind"), now fixed.

## Fixed (each test failed first unless noted)

| Finding | Fix | Commit |
|---|---|---|
| C1: two real same-day (date-only) or same-minute equal transactions merged silently (gate 28) | No shared reference → ask, never auto-link | `0ed6fde` |
| M1, re-graded Important: a "never share your PIN/OTP" footer got real bank SMS refused | Advisory phrases ignored; an OTP is a secret only next to a code | `2133b32` |
| I3 + I2 refused mappings: a refused fee left a half-posted event shown as "nothing saved"; a mapping the posting rules refuse dead-ended | decide checks the fee posting too; a refused mapping asks again | `0acd5a0` |
| I4: a corrected withdrawal's open question moved the old amount | Follow the correction to its replacement; refuse after a pure reversal | `dfaacf1` |
| I1: matching skipped when the user supplied the date or account → double counting | Undated SMS matched at paste time; decide re-matches when the user supplied an account (mutation-checked) | `854bb7e` |
| I2 hash lock: rejected/cancelled or recurring undated SMS could never be recorded again | Re-paste after rejection/cancel is a new event; undated evidence is a duplicate only within one Dhaka day | `281f059` |
| I2 promotional wording: a bank SMS with an offer line had no transaction, only Reject | The bank's reading is kept; it asks, and the user's confirmation posts | `29b1c3d` |
| I2 AI "not financial": ended as rejected with no review | Asks the user instead; a parser's exact "declined" still rejects | `23a506c` |

Verification after the pass: `pnpm verify` 81 files / 1,329 tests; `pnpm test:emulator` 445 + 26; `pnpm test:e2e` 1 passed; `pnpm test:e2e:fixture` 4 passed.

## Rulings made in the fix pass

- Without a shared bank reference, nearness never auto-links (it asks). Cost if wrong: more "possible duplicate" questions.
- An undated SMS is matched at its paste time. Cost if wrong: same as above.
- A confirmation after seeing a possible match is the user's judgment and posts. Cost if wrong: a user who confirms without reading can still double-count.
- Undated evidence hashes with the Dhaka paste day: two identical undated notes on one day still merge. Cost if wrong: a same-day repeat needs rewording.
- A parser conflict yields to the user's confirmation of the shown reading. Cost if wrong: none (two bank readings that disagree still have nothing to confirm).
- Refused mappings ask again rather than filtering the chat's options by what the posting rules accept. Cost if wrong: the user may pick a refused option and be asked again.

## Deferred minors

- M2: an amount with 8+ digits ("BDT 12345678.00") is masked as an identifier, so it can't be parsed.
- M3: on an incoming transfer the fee is charged to the other account.
- M4: the `finalizesAuthorization` posting branch is unreachable and untested.
- M5: a missing `DEEPSEEK_API_KEY` also stops deterministic parsing (relevant at piece 4).
- M6: a follow-up's due time isn't used to delay showing it; gate 31 evidence covers snooze/wake only.
- M7: no Retry button for a dead letter with a missing provider result.
- M8: dead `otp` branch in the chat view model; `SYSTEM_CASH_ACCOUNT_ID` literal in web.
- M9: AI candidates carry no provider, so `aiAutoPostThresholdBp` has nothing to tune yet.
- M10: no way to record an ATM cash reversal (Phase 3).
