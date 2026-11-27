# Spending tips (CR-007 piece 3) — progress

Spec: [`../specs/2026-11-26-spending-tips-design.md`](../specs/2026-11-26-spending-tips-design.md) (approved 2026-11-27).
Plan: [`../plans/2026-11-27-spending-tips.md`](../plans/2026-11-27-spending-tips.md). Branch `spending-tips`, built inline.

| Task | State |
|------|-------|
| 1 Dashboard figure rules shared from contracts (no figure changed) | done |
| 2 Tips document, refreshTips contract, `tips` call stage, read policy migration `20261127000000` | done |
| 3 `tipFacts` | done |
| 4 Advice validator, `writeTips`, DeepSeek prompt `tips-v1` | done |
| 5 Tips repository | done |
| 6 `RefreshTips` use case | done |
| 7 `/api` command and wiring | done |
| 8 Tips card and demo tips (mock-up approved by Mabrur 2026-11-27) | done |
| 9 Dashboard wiring (refresh on open, New tips, Sort, Count my cash), e2e, docs | done |

## Decisions and notes

- No separate tips budget: tips reserve the normal AI estimate against the user's limits and the
  global cap; a refused reservation shows the figures only.
- Tips provider calls use the request key (`tips-<day>-auto`, `tips-<day>-new-<n>`) in place of a
  source event, with the call stage `tips`. The provider-result purge walks terminal source events,
  so it never reaches these calls: their stored result is advice text (no digits, no identifiers)
  and stays until account deletion.
- The validator also rejects Bangla digits and amount words (hundred, thousand, lakh, crore,
  percent, taka, Tk), and, for unexplained cash, spent/wasted/lost.
- The demo's tips are the facts its own figures give (not sorted, unexplained cash, Groceries 37%),
  pinned by a test.
- `tools/e2e/local-supabase.sh` now runs `supabase migration up --local`: a stack left running
  keeps its database, so a new migration was never applied there.

## After merge

This changes `/api` and adds migration `20261127000000_tips_read_policy.sql`, so the backend needs
`pnpm deploy:supabase` (it runs `db push`) besides the automatic Cloudflare web deploy.

## Deferred minors (fixing on branch `tips-minors`, requested 2026-11-27)

| Minor | State |
|-------|-------|
| M13 "e.g." / "Mr." no longer count as sentence ends | done |
| M10 New tips hidden when nothing stands out | done |
| M8 Long-time users early in the month see "after a few spends this month" | done |
| M12 A missing DeepSeek key still saves the figures | todo |
| M5 Concurrent refreshes never save older facts or drop newer advice | todo |
| M6 Two tabs opening at once make one AI call, no false "worker died" | todo |
| M11 A tips call's stored result is cleared once its advice is saved | todo |
