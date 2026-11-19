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
