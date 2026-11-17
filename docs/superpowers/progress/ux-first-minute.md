# UX first minute (audit fixes #1–#5)

Branch `ux-first-minute`. From the 2026-11-17 UX audit (phone + desktop screenshots of the
local app). Mabrur approved fixing #1–#5 ("lets do it"). One commit per fix, test first.

- [x] #1 "Where it went" showed `Nominal:expense:uncategorized:BDT`: the chart only read the
  demo's `expense-<cat>` ids. Now reads `nominal:expense:<cat>:<cur>` too; uncategorized shows
  "Not sorted yet". (Letting people pick a category is a separate feature, not done.)
- [x] #2 Empty dashboard after sign-in: a "Paste a bank SMS" button (opens the chat with the
  message box focused, via `data-autofocus` in `useModalFocus`) and how to copy an SMS.
- [x] #3 "N questions need your answer" on the dashboard, opening the chat. The chat opener
  now carries the badge's count (`waiting`).
- [x] #4 Failed messages say "Couldn't read", like Recent. A message the reader couldn't make
  sense of (`stageFailed`) says to paste the whole SMS; a reading-side failure
  (`attemptsExhausted`, `providerResultMissing`) doesn't blame the message. No Retry added:
  the server refuses most dead letters.
- [x] #5 "Net money" is now "Money tracked" with "Only what you've added here, so it won't match
  your bank balance." Withdrawn cash with no place yet is listed as "Cash", so the rows add up.
