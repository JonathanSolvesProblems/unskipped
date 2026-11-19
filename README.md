# Unskipped

Your beta reader's face and pulse leave margin notes in your manuscript.

A reader who agrees to it reads your chapter in front of their laptop camera. The [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/) reads their pulse, blinks, smiles, and whether they are talking or looking away, on the device. Unskipped turns that into one note per paragraph ("smiled here", "gripped here", "may have drifted here", or "no reading: you looked away"), the reader approves every note, and the writer gets them as Word comments in their own .docx.

Entry for the DEV Presage SmartSpectra SDK Challenge (November 2026). Work in progress.

## How to run it

Requires Windows 11, macOS (Apple Silicon) or Linux x64, Node 20+ and a webcam that delivers 25 fps or more.

```bash
git clone https://github.com/JonathanSolvesProblems/unskipped
cd unskipped
npm install
echo PRESAGE_API_KEY=your_key > .env   # free key: https://physiology.presagetech.com/auth/register
npm start
```

Tests: `npm test`.

## License

MIT. The sample story, Saki's "The Open Window" (1914), is in the public domain; text from Wikisource.
