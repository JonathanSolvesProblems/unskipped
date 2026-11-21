# SmartSpectra on this laptop: what the first live tests showed

19 November 2026. Windows 11, ACER HD User Facing webcam (built in), @smartspectra/node-sdk 3.5.0, main-process capture (`tools/camtest.js`). Raw streams are in `tmp/` (not committed; they are short camera checks, not readings).

| Run | Metrics requested | Length | Frame rate | What came back |
|---|---|---|---|---|
| 1 | breathing + cardio + face bundles | 25 s | 29.9 fps | Validation code 7 ("Place more of the chest in view") on every frame; blinking and talking only, no pulse, no expressions |
| 2 | cardio + face bundles | 25 s | 29.9 fps | Still code 7 throughout; blinks now detected; no cardio packet, no expressions |
| 3 | PULSE_RATE + face, reader sat further back | 30 s | 29.9 fps | Frame valid in short runs (longest about 4 s), broken by code 7 and code 17 ("face the screen"); expressions and landmarks arrive; no cardio packet |
| 4 | PULSE_RATE + face, face and chest framed (checked first in the Windows Camera app) | 40 s | 29.9 fps | Frame valid 37 s straight; first pulse packet at 19.3 s, then one every ~0.6 s; settled at 92 to 94 bpm, confidence 90 to 98, stable |

What this means for the app:

- The built-in webcam is fast enough (29.9 fps against the 25 fps minimum).
- Pulse needs the upper chest in frame as well as the face, and about 16 s of uninterrupted valid frames before the first value. The settle screen tells the reader to sit back and waits for a confident pulse.
- Requesting the full cardio bundle produced no cardio packets at all on this setup; `PULSE_RATE` alone works. This matches open SDK issue #18.
- The camera driver cannot lock exposure ("lock collapsed image brightness ... auto exposure stays active during the measurement on this hardware", SDK log), so lighting should stay constant during a reading.
- Credits used for these four checks: about 6 of 100.

## Windows Smart App Control (21 November 2026)

The same laptop that ran the tests above refused to load the SDK on 21 November: `could not load packaged runtime ... smartspectra_capi.dll`. LoadLibraryExW returned Windows error 4551 (an Application Control policy blocked the file). Smart App Control had moved from evaluation to On by itself; the CodeIntegrity log has no events for the SDK before that morning, then event 3077 (blocked) for `smartspectra_capi.dll` and 3033 (signing level not met) for it and the bundled `vulkan-1.dll`. All four DLLs in `@smartspectra/node-sdk-win32-x64` 3.5.0 are unsigned; `opencv_world4100.dll` still loaded. Smart App Control has no per-file exception, so the fix was to turn it off. Signed DLLs from Presage would remove the problem for every Windows 11 user with it on.
