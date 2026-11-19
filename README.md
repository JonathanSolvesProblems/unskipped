# Unskipped

**Your beta reader's face and pulse leave page flags in the margin of your manuscript.**

A reader who agrees to it reads your chapter on their laptop with the camera on. The [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/) reads their pulse, blinks and smiles, and whether they are talking or looking away, on that laptop. Unskipped turns it into one flag per paragraph:

- pink: gripped (pulse up, or blinking slowed),
- yellow: smiled,
- blue: may have drifted (blinking sped up),
- clear: no reading (looked away, talking, poor light). It says so instead of guessing.

The reader marks the paragraphs that got them before seeing any flag, reviews every note, keeps or drops each one, and sends a small file. The writer adds it to their manuscript, and each note becomes a Word comment on its paragraph, signed with the reader's name.

Entry for the [DEV Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04), November 2026.

## How to run it

Needs Windows 11 (x64), macOS on Apple Silicon or Linux x64, Node 20 or newer, and a webcam that gives 25 fps or more (the built-in webcam on my Windows laptop gave 29.9).

```bash
git clone https://github.com/JonathanSolvesProblems/unskipped
cd unskipped
npm install
```

Get a free Presage key at https://physiology.presagetech.com/auth/register and put it in a file named `.env` in the project folder:

```
PRESAGE_API_KEY=your_key_here
```

Then:

```bash
npm start
```

Choose **Open a chapter to read**, pick `stories/the-open-window.md` (or your own .docx, .md or .txt), and follow the screens. Sit so the camera sees your face and the top of your chest; the first pulse reading takes about 15 seconds of a steady picture. Each 30 seconds of live measurement uses one credit of the free trial's 100.

To write the notes into a manuscript: **I'm the writer**, choose the manuscript, add the reading files from `readings/`, and **Write the notes into my manuscript**. It saves a copy with "(reader notes)" in its name and opens it.

**No camera or key?** The replay page plays back a real recorded reading through the same scoring code: open `app/ui/index.html` from a local web server (`npx http-server .` then `/app/ui/`), or the hosted copy linked from the DEV post.

## Checks

```bash
npm test        # unit tests: scoring, grading, Word comments
npm run results # re-score the committed sessions in results/sessions/ into results/summary.json
npm run check   # results, then fail if any number in post/devto.md disagrees with them
```

## How it decides

`src/score.js` holds every threshold (`THRESHOLDS`), fixed before the graded read; `results/controls.md` lists the pre-registered planted cases and any later change. In short: pulse readings are credited to the paragraph read about 6 seconds earlier (the SDK's pulse is a ~12 second average); a paragraph 4 bpm over the reader's own median, or with blinking under 60% of their own rate, is pink; a smile held 0.7 s is yellow; blinking over 160% of their rate is blue; a paragraph where the SDK reported no forward face, or the reader talked, for most of its time is clear. `results/sdk-notes.md` records what the first camera tests showed (pulse needs the chest in frame; `PULSE_RATE` alone works where the full cardio bundle returned nothing).

## Privacy

No video or image is recorded or sent. The SDK runs on the reader's machine with telemetry off, and contacts Presage only to check the key and count usage. Reading files contain only the notes the reader kept, their own marks and summary numbers; raw signal samples are included only if they tick a box that is off by default. There is no server. See the Consent and Data Handling section of the DEV post.

## License

MIT. Saki's "The Open Window" (1914) and the Austen sample are in the public domain; the Saki text is from Wikisource.
