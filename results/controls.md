# Pre-registered controls

Committed before any graded reading. The thresholds in `src/score.js` (`THRESHOLDS`) are fixed as of this commit; any later change will be listed below with its date and reason, and the graded sessions re-scored with both versions.

## The graded read

- Reader: Jonathan. Text: Saki, "The Open Window" (1914, 29 paragraphs, 1,212 words), which he has not read; it was chosen and converted by script without the text being shown to him.
- He marks "got me" and "lost me" paragraphs on the marks screen before any note is shown. The session file records `marks.savedAt` before `review.openedAt`.
- Graded: how many of his "got me" paragraphs the camera flags (gripped or amused), against how many the time-per-word baseline flags (lingered). Precision reported beside recall for both.

## Planted cases (a second, short session, after the graded read)

Same story, first 12 paragraphs, read again with planted actions. Each planted paragraph must come out as "no reading" with the stated reason, and never as gripped, amused or drifting.

| Paragraph (0-based) | Planted action | Expected note |
|---|---|---|
| 2 | Look at the phone on the desk, away from the screen, for the whole paragraph (~15 s) | no reading: you looked away |
| 5 | Read the paragraph aloud | no reading: you were talking |
| 8 | Turn away from the screen entirely (face out of frame) | no reading: you looked away |
| 10 | Read normally (harmless control) | not "no reading" |
| 11 | Read normally (harmless control) | not "no reading" |

Pass: all three planted paragraphs refused with the right reason, and both harmless paragraphs given a reading. Misses are published in the post and fixed, not hidden.

## Changes after this file was first committed

- 21 November 2026, before the graded read, after a pilot read (kept out of the results). With free scrolling, the reader read a whole screenful below the reading line and then scrolled on, so all of that time was credited to the one paragraph on the line: a 9-word paragraph got 266 seconds and most others 0 to 1. The read screen now guides reading one paragraph at a time (Space, the down arrow or one scroll step moves on; paragraphs ahead stay faded and blurred), so the paragraph being read is known. The pilot also ended with no marks, so saving with none now asks first. Scoring code and thresholds are unchanged.
- 20 November 2026, before the graded read, after an independent code review. A simulated reader with no reaction at all (random blinks, flat pulse, no smile, the story's paragraph lengths) was flagged "gripped" on 22% to 38% of paragraphs and "drifting" on 13% to 21%, because blink rate was judged on windows of a few seconds where 0 or 1 blinks is normal. A third of any reader's "got me" marks would have been "found" by chance. Changes, none of them to a threshold value:
  - Blink rate is judged only where the reader's own rate predicts at least 3 blinks in that paragraph's readable time (new `minExpectedBlinks: 3`). Same no-reaction reader now: gripped 0.5% to 6.7%, drifting 0.2% to 3.2% (`node tools/null-check.js`, `results/null-check.json`).
  - A smile is the longest unbroken run of happy readings, not scattered blips added up (the 0.7 s rule now means 0.7 s held).
  - A blink counts only at a moment that counts as readable time (it was skipped only when looking away or talking, so blinks in dark or moving time inflated the rate).
  - Pulse is placed at its own timestamp from the SDK, which trails the face frames by about 1.3 s, before the 6 s lag is applied.
  - The reading line credits nobody while the title is on it or after the last paragraph.
  - The grade now states how many marked paragraphs chance alone would find (marked x flagged / judgeable), and every result is reported beside it.
  - `tools/results.js` refuses any session whose marks were not saved strictly before the review opened, including missing dates, and scores the planted controls below automatically.
- 19 November 2026, before the graded read: a paragraph read cleanly but for under 3 s (a short line of dialogue) is now "brief" with no flag, instead of "no reading: too short to read a signal". Reason: in a layout check, the short dialogue lines of the story filled the page with "no reading" flags that were not refusals. The "no reading" refusal (most of the paragraph's time without a readable face) and every threshold value are unchanged. Planted controls are unaffected: each planted action lasts a whole paragraph.
