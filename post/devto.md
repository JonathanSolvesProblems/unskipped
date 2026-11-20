---
title: "Unskipped: my reader's face and pulse left page flags in the margin of the story, and they found the paragraphs I'd have said got me"
published: false
tags: devchallenge, presagechallenge, writing, electron
---

*This is a submission for the [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04).*

## What I Built

Every writer who has sent a chapter to beta readers knows the reply: "Loved it!" It is kind, and it tells you nothing about the paragraph where they put the book down in their head and kept turning pages.

Elmore Leonard's tenth rule of writing is "Try to leave out the part that readers tend to skip" (The New York Times, July 16, 2001). The hard part is knowing which part that is.

**Unskipped** is a desktop app for a beta reader who agrees to it. They read your chapter on their laptop with the camera on. The Presage SmartSpectra SDK reads their pulse, their blinks, their smiles, and whether they are talking or looking away, on their own machine. Unskipped turns that into one mark per paragraph, like the translucent page flags a reader sticks in a book:

- **pink**: gripped (their pulse rose, or their blinking slowed down),
- **yellow**: they smiled,
- **blue**: they may have drifted (their blinking sped up: in a 2010 study at the University of Waterloo, readers blinked more when their minds wandered from the page),
- **clear**: no reading. They looked away, talked, or the light was bad, and Unskipped says so instead of guessing.

Before the reader sees a single flag, they mark the paragraphs that got them and lost them themselves. Then they review every note, drop any they don't want to share, and send a small file. The writer adds it to their own manuscript, and each note lands as a **Word comment on its paragraph**, signed with the reader's name. It opens in Word or Google Docs, where the writer already works.

Claire, in the demo, is a composite: a novelist revising chapter by chapter with three beta readers. The reader is me, reading a story I had never read.

## Demo

{% youtube TBD %}

**Try it with no camera and no key:** [the replay page](https://jonathansolvesproblems.github.io/unskipped/) plays back my real recorded reading through the same scoring code, with the flags, the notes and the numbers.

## Code

{% github JonathanSolvesProblems/unskipped %}

Setup is in the README: `npm install`, put a free Presage key in `.env`, `npm start`. `npm test` runs the unit tests, and `npm run check` re-scores the committed reading sessions and fails if any number in this post disagrees with them.

## How It Responds to Human Signals

| SmartSpectra signal | What Unskipped does with it |
|---|---|
| Pulse rate (with its confidence) | Each confident reading is credited to the paragraph that was on the reading line about 6 seconds earlier, because pulse is an average over roughly 12 seconds. A paragraph 4 bpm or more above the reader's own median gets a pink flag. |
| Blinking | Blink rate per paragraph against the reader's own rate for the session, judged only where that rate predicts at least 3 blinks (in a few seconds, 0 or 1 blinks is normal and says nothing). Under 60% of it: absorbed (pink). Over 160%: may have drifted (blue). |
| Expressions | A happy expression held unbroken for 0.7 s or more: yellow. |
| Talking | Time spent talking is not reading time. A paragraph read mostly aloud gets "no reading". |
| Validation status (face not forward, no face, too dark, moving) | Same: the SDK's own call that the picture is not a reading face, so no guess for that paragraph. |

The reading line is a dashed rule across the screen at 38% of its height; the paragraph crossing it is the one being read, and the app records when each paragraph arrived there. All thresholds were committed before my graded read (`results/controls.md`), and every later change is listed there with its date and reason.

One of those changes is worth telling. Before the graded read I had a fresh reviewer go through the scoring code, and it found that a reader with no reaction at all would still get about a third of paragraphs flagged "gripped": blink rate was being judged on windows of a few seconds. I fixed it before reading, and kept the check as a script (`node tools/null-check.js`). A simulated reader with random blinks, a flat pulse and no smile is now flagged gripped on at most <!--claim:nullcheck.maxFalseGrippedPct-->6.7<!--/claim-->% of paragraphs.

What I learned about the SDK on my laptop, from four short test runs (`results/sdk-notes.md`): the built-in webcam held 29.9 fps; pulse needs the upper chest in frame as well as the face, and about 16 seconds of steady picture before its first value; and requesting the full cardio bundle produced no pulse at all on my setup, while `PULSE_RATE` alone worked (the same thing is reported in SmartSpectra issue #18). So the settle screen asks the reader to sit back until the camera sees them down to the collarbones, and waits for a confident pulse before reading starts.

### Does it find what the reader would say?

I read Saki's "The Open Window" (1914, 29 paragraphs) without having read it before, then marked the paragraphs that got me before I saw any flag.

- Of the <!--claim:graded.camera.got.marked-->TBD<!--/claim--> paragraphs I marked, the camera flagged <!--claim:graded.camera.got.found-->TBD<!--/claim-->. Flags placed at random would have found <!--claim:graded.camera.got.chance-->TBD<!--/claim-->.
- Time on the page alone, which is what reading apps measure, found <!--claim:graded.dwell.got.found-->TBD<!--/claim--> (by chance: <!--claim:graded.dwell.got.chance-->TBD<!--/claim-->).
- <!--claim:graded.refusedCount-->TBD<!--/claim--> paragraphs had no reading, each with its reason.

**Controls**, written down before the run: on a second read I looked at my phone for a whole paragraph, read one aloud, and turned away for another. <!--claim:controls.plantedRefused-->TBD<!--/claim--> of 3 came back as "no reading" with the right reason, and <!--claim:controls.harmlessRead-->TBD<!--/claim--> of the 2 paragraphs I read normally got readings.

**Pulse against a reference**: TBD (fingertip pulse oximeter beside the camera).

## Prize Categories

**Best Thoughtful Real-World Use.** A real, recurring need (every beta read of every chapter), consent designed as the product rather than a dialog, and data that never leaves the reader's laptop unless they send it.

**Most Creative or Delightful Use.** A reader's body leaving page flags in a manuscript, read back as Word comments.

## Consent and Data Handling

- **Consent.** The camera does not turn on until the reader ticks "I agree to be measured while I read this piece" on a screen that lists, in plain words, what is read, where it is processed, what the writer will get, and that it says nothing about their health. Nothing is measured until they press Start reading. Stop is on every screen, and closing the window turns the camera off.
- **Processing.** SmartSpectra runs on the reader's computer (the Node.js SDK in the app's main process). No video or image is recorded, saved or sent by Unskipped.
- **What goes over the network.** The SDK contacts Presage to authenticate the API key and to count usage during a measurement. That is all the network traffic Unskipped causes.
- **SDK telemetry.** Off. Unskipped starts the SDK with `enableTelemetry: false`; Presage's docs say that with it off, "the SDK starts no telemetry session and transmits nothing" for telemetry.
- **Storage.** During a reading, the signal samples (pulse value and confidence, blink and talking flags, a smile score, and whether a face was found; no image, no face geometry) are kept in memory and in a local backup file in the app folder, so a crash does not lose the session. The file the reader sends contains only the notes they kept, their own marks and summary numbers. Raw samples are included only if the reader ticks a box that is off by default.
- **Sharing.** Nothing is uploaded anywhere. The reader saves a file and sends it to the writer however they like. The writer's manuscript never leaves the writer's computer.
- **Retention and deletion.** All files are ordinary files on the reader's and writer's disks; deleting them deletes the data. Unskipped has no server and keeps nothing. Presage's authentication and usage records are governed by Presage's own policy.
- **AI services.** None. No language model or other AI service is used by the app.
- **Not a health tool.** The readings describe how someone read one piece. The app makes no health claim and uses no health language.

## What's next

One reader is a start, not a result. On 20 November I wrote to the Quebec Writers' Federation in Montreal and offered a free session to any member who wants to try it on a chapter: I set it up and sit in, their beta reader reads, they get the comments. I also asked what a writer would need to see before trusting something like this, because that answer decides what gets built next.

After that: more readers on the same chapter (the export already stacks several readers' comments on one manuscript), and a longer read than a short story, where drifting matters most.

## Agent Session

TBD
