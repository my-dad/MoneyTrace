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

## Motion (Mabrur: "everything seems too fast", approved design 2026-11-17)

- [x] CSS only, no library. Timing tokens in `tokens.css` (`--mt-motion-fast/-/-slow` 120/200/260 ms,
  ease-out in, ease-in out). `prefers-reduced-motion: reduce` turns every animation and transition off.
- [x] Chat slides up (phone) / in from the right (desktop) and back out; it stays mounted for the
  slide-out (animationend, 400 ms fallback; at once without motion or matchMedia).
- [x] Chat messages, status lines and questions rise in; a status change (Reading → Recorded) arrives
  as a new line. Question badge pops when the count changes.
- [x] Dashboard figures fade in after loading and per month; menu grows from its button; category bars
  grow; buttons and chips give on press and change colour on hover.
- Left out on purpose: amounts counting up (would show figures that aren't real for a moment).
- Checked in Chromium (Pixel 7): animations run, chat removed after its slide-out, gone at once with
  reduced motion.

## Round 2 (Mabrur: "fix 6, 7 and 11 too"), branch `ux-polish-2`

- [x] #6 Recent rows name the source once (its chip, per CR-008), not again under the title, and
  only mark what needs attention: no "Recorded" badge on every row. The chat still says Recorded.
- [x] #7 Not a real problem: the page already leaves 112 px under the last row, so the chat button
  never covers it (checked at phone size, scrolled to the bottom). The audit's overlap came from a
  full-page screenshot drawing the fixed button mid-page. No change.
- [ ] #11 Focus lost when a chat card replaces the focused button (cash count Check), so Escape stops
  working.
