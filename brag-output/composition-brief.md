# Hyperframes Composition Brief: Tikkr

## Objective
Create a short launch-style brag video for Tikkr, a cloud time-clock for Swedish
machine shops. No narration: on-screen Swedish type and music carry everything.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape, 1920x1080 (a vertical 1080x1920 render follows afterwards)
- Duration: 20.7 seconds

## Source Material
- Project root: `C:/Projekt/Tikkr`
- Primary files read:
  - `src/components/kiosk/KioskScreen.tsx` (the screen being recreated)
  - `src/components/marketing/Sections.tsx` (the copy)
  - `src/lib/brand.ts`, `src/app/globals.css` (palette)
  - `TONE-OF-VOICE.md`, `CLAUDE.md` (language rules, terminology)
- Product name: Tikkr
- Tagline / strongest claim: "Tid som registrerats en gång blir underlag till
  kundens faktura, till er egen efterkalkyl och till lönen."
- Key UI moment to recreate: the employee name grid on the clock-in screen, and
  one card flipping from white to Tick Deep green with the job written on it.
- Logo asset (never set as type): `public/brand/tikkr-logo-horizontal-reversed.svg`

### Copy that must appear verbatim
- Vad gjordes på tisdagen?
- På fredagen ska någon minnas.
- STÄMPLING PER ORDER
- Ej instämplad
- Slå in ordernummer
- Välj arbetsmoment
- 2601 · Svetsning
- En stämpling. Tre underlag.
- Underlag per order / till kundens faktura
- Efterkalkyl / till er egen lönsamhet
- Tidrapport / till lönen
- Tiden tickar. Tikkr räknar.
- tikkr.se

Employee names on the cards (sample data, not claims): Anna Lind, Johan Berg,
Mikael Ek, Sara Holm, Erik Dahl, Lena Nyström.
Work moments in the list: Svetsning, Fräsning, Lackering, Montering.

**Do not alter, translate or re-word any Swedish copy.** Every line is bound by
the project's own terminology file. In particular: the screen is a
*stämplingsskärm*, never a *kiosk*; *underlag*, *efterkalkyl* and *tidrapport*
are three distinct documents with fixed names.

## Creative Direction
- Tone preset: polished
- Creative direction: Swedish industrial restraint. Built by people who care
  about details, not an American startup translated into Swedish.
- Interpretation: four scenes, long holds, no flourish. Confidence comes from
  how little the video does. Nothing bounces, spins or glows.
- Angle: the money that quietly disappears. Work nobody managed to report does
  not get invoiced, and the loss is invisible because nobody knows what is
  missing. State the problem, show one tap on the real screen, end on the three
  places that single tap goes.
- Hook: full Fjord, four white words slam in on the first beat: "Vad gjordes på
  tisdagen?"
- Outro / punchline: the reversed wordmark lands on a strong cue, then the
  slogan "Tiden tickar. Tikkr räknar."
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Any seventh colour
  - Rendering the wordmark as a text node

## Visual Identity
Exact values from `src/lib/brand.ts`. Six colours exist and no more.

- Background (dark): `#0E1A2B` Fjord
- Background (light): `#F5F6F2` Snö
- Text on light: `#0E1A2B` Fjord; secondary `#5B6573` Skiffer
- Text on dark: `#FFFFFF`
- Accent on light: `#0F9E68` Tick Deep (the clocked-in card fill)
- Accent on dark: `#2ED196` Tick (small labels only)
- Lines, card borders: `#D9DDD6` Lav
- Display font: Geist Semibold 600, tracking minus 3% on large headings
- Body font: Geist Regular 400; labels Geist Medium 500
- Visual references from the project:
  - White rounded card, Lav border, round avatar circle left, name right,
    small Skiffer status line at the bottom
  - The same card filled `#0F9E68` with white text when clocked in
  - A numeric keypad of white keys with Lav borders

Green is an accent and never the dominant surface. Fjord and Snö carry every
frame; `#0F9E68` appears on one card and nowhere else.

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. **Frågan** — 4.1s — Full Fjord. "Vad gjordes på tisdagen?" slams in on the
   first beat and holds; "På fredagen ska någon minnas." fades in beneath at
   2.46. Nothing else moves.
2. **Stämplingsskärmen** — 7.4s — Snö. The recreated clock-in screen: 3x2 name
   grid, cursor presses Anna Lind, keypad punches 2-6-0-1 one digit per beat,
   work moment list, then back to the grid where her card is now Tick Deep green
   reading "2601 · Svetsning". This is the centrepiece and must read as the
   product being operated.
3. **Tre underlag** — 5.5s — Snö. The green card shrinks to the corner as the
   origin; "En stämpling. Tre underlag." heads three white cards arriving on
   every other beat, held together for 2.7s at the end.
4. **Avslut** — 3.8s — Fjord. Reversed wordmark SVG lands on the strong cue at
   18.55, slogan at 19.10, `tikkr.se` at 19.64, music ends on the beat at 20.74.

## Audio
- Audio role: sparse professional accents over a restrained bed
- Audio arc: the bed runs unbroken at half volume for the whole video. Sound
  only marks things the viewer sees being pressed or arriving. The last half
  second is silent.
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM)
- Music treatment: in from 0.00 at volume 0.5, fade-in no longer than 0.3s,
  fade out over the final 0.8s, never above 0.5.
- Music cue guidance: bundled preset at
  `~/.claude/skills/brag/assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.json`.
  Beat grid every ~0.546s. Scene boundaries on beats 4.10 / 11.47 / 16.93 /
  20.74. Strong cues available at 18.01, 18.55, 20.19, 20.74. Lock the wordmark
  landing to 18.55. Snap the keypad digits to 6.82 / 7.35 / 7.79 / 8.22 and the
  three document cards to every other beat at 11.47 / 12.56 / 13.64.
- Audio-reactive treatment: none. Polished restraint, and an industrial product
  should not pulse to music. Do not wire RMS to anything.
- Audio-coupled moments:
  - Scene 2, name press — simulated interaction, one interface tap
  - Scene 2, keypad digits — beat-aligned key ticks, four of them
  - Scene 2, card turns green — one soft confirm, the payoff of the scene
  - Scene 3, three cards — card sequence, one quiet tick each, equal weight
  - Scene 4, wordmark landing — one low impact, nothing after it
- SFX selection guidance: four kinds of sound in the whole video and no more.
  Dry, short, mechanical. No whooshes, risers or stingers on text entrances. If
  a sound is not matched to something being pressed or arriving, leave it out.
- SFX analysis guidance: use `~/.claude/skills/brag/assets/sfx/sfx-analysis.md`
  if present; prefer low high-frequency-risk files, since every cue here is in a
  polished, quiet edit.
- Exact SFX choice: choose filenames, timestamps, density and volume based on
  the implemented animation.
- Audio files: copy the chosen music and any selected SFX into
  `brag-output/composition/assets/`.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`,
`hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes` and
`hyperframes-cli`. This is the `/brag` workflow: do not enter the `hyperframes`
entry-point intent interview and do not route into the generic promo /
launch-video workflow. Prefer native Hyperframes conventions over anything in
`/brag`.

Requirements:
- Recreate the real clock-in screen in scene 2. This is the one non-negotiable
  visual: the product being operated, not a diagram of what it does.
- Keep all Swedish text readable. The reading floors are tabulated in
  `brag-plan.md`; there is no narration, so text legibility is the whole video.
- Keep the video within 15-25 seconds.
- Include the music and SFX layer as specified.
- Treat the audio notes as guidance; choose SFX after the animation exists.
- Lock the wordmark landing to the strong cue at 18.55 (±0.15s) and mark it
  `// beat-locked`. Snap the keypad digits and the three document cards to the
  beat grid (±0.10s) and mark them `// beat-grid`.
- Audio-reactive is deliberately off. Document it, do not implement it.
- Load Geist locally; the project packs it with `next/font`, and the video must
  not depend on a network fetch at render time. If Geist cannot be loaded, stop
  and say so rather than substituting another face — the wordmark and the type
  are the brand.
- Use local assets throughout.
- Run `hyperframes check` before render. It is the single gate.
- Keep creation and rendering local.
