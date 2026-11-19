# Unskipped: design direction

Mode: redesign. The first build was cream paper, a rust-red pencil and serif headings: print-editorial and the most common AI-generated house style at once.

## Phase 0
- Platform: Electron desktop app (HTML/CSS/JS), plus a static replay page for judges and the DEV post images. Seen mostly at 1280x720 in the demo video.
- The screen that matters: Review. The reader's page with a mark on every paragraph, their own marks beside the camera's, and the headline number (camera vs time-per-word against the reader's marks). Second: Read (live signals while reading).
- Where the result really lands: the writer's own .docx, as Word comments. The app is the instrument; Word is the destination (final shot of the video).
- Constraints: vanilla JS, no build step; offline fonts; 3 days to the deadline, so one light theme (a hackathon skips theme toggles; the material is paper on a desk).
- Locked inputs: none. Presage's brand is not borrowed.
- Audience: DEV judges (usability, originality), and a writer who should feel this is a reading tool, not a medical one.
- Tools: local ComfyUI (RTX 5060) for illustration material.

## Preservation inventory
Keeping: the flow (consent, settle, read, your marks first, review with delete, send), the plain-words consent copy, the reading line that decides the focus paragraph, the live readout rail, the "no reading, does not guess" note.
Fixing: cream canvas plus rust accent plus serif headings (house style); no imagery at all; tracked-caps-free but stat-block row of three cards; notes styled as fake handwriting (Segoe Print); nothing a cropped screenshot would be recognised by.

## Category convention (what everyone ships)
Biofeedback and wellness apps: dark or lavender gradients, glowing orbs, heart icons and ring gauges. Writing tools: cream paper, serif, hairlines. Avoid both.

## The found object
Page flags. Beta readers and students mark books with translucent sticky flags: the clear film half sticks over the line so the words stay readable, the fluorescent half sticks out past the fore-edge, and a well-read book bristles with them. That is exactly what this product makes: one coloured mark per paragraph that the writer can see from the edge. (The Wikimedia search for photos returned national flags and then rate-limited; the details above are from the object itself, written down here rather than invented later.)

## Family
dimensional-tactile: real paper and translucent film with depth, a page lying on book cloth, flags that overlap the page edge and cast a small shadow on the cloth. Last used by setpiece (4 projects ago), so allowed. Banned now: luminous-emissive, mechanical-industrial, retro-computational (last three).

## Three directions
1. Flags (chosen). Bottle-green library buckram desk, cool white page, fluorescent film flags as the only colour, overhanging the page edge. Axes: light page on dark cloth, colour carried by data only, depth from paper elevation.
2. Reading lamp (cinematic-atmospheric). A dark room, a warm pool of lamp light on the page, the pulse as the lamp's breathing. Rejected: warm lamp on near-black reads as setpiece-v2's cloth-and-light stage; and it romanticises measuring someone.
3. Seismograph strip (mechanical-industrial). A drum recorder's pen trace running down the margin. Killed by the family ban (keyhook).

## Design code
- Colour lives only on the flags, because the flags are the product's output; the chrome is ink, paper and cloth.
- The page is a sheet with real elevation lying on book cloth, because the writer's manuscript is the object being marked, and nothing else on screen is.
- Flags overhang the page edge, because that is how a reader's marks are found in a real book: from the edge, before opening it.
- The reader's own marks are pencil, the camera's are film, because one is a person's judgement and the other is a measurement, and they must never be confused.

## Anti-brief
- No heart icons, pulse-line logos, orbs or glow: this is not a health app.
- No fake handwriting fonts.
- No stat-card rows.

## Expressive axis
Colour, carried entirely by four fluorescent flag colours on an otherwise ink-paper-cloth screen.
