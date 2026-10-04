# Brag Plan: Tikkr

## What is this app?
A cloud time-clock for Swedish machine shops: an operator taps a touchscreen on
the shop floor and the hour lands on the right customer order and the right work
moment, becoming the basis for the invoice, the job costing and the payroll.

## The angle
Not "track your time". The angle is the money that quietly disappears: work that
nobody managed to report does not get invoiced, and the loss is invisible because
nobody knows what is missing. The video states the problem, shows one tap on the
real screen, and ends on where that single tap goes.

No narration. On-screen Swedish type and music carry the whole thing.

## Hook (first 2-3 seconds)
Fjord fills the frame. Four words slam in, white, large: **"Vad gjordes på
tisdagen?"** It is the question a workshop manager actually cannot answer on a
Friday, and it earns the next 18 seconds because the viewer has lived it.

## Key moments (the middle)
- The name grid on the clock-in screen: plain white cards, one per employee.
- A single tap turns one card Tick Deep green with the job written on it. That
  colour change IS the product. Green means time is running right now.
- The order number punched on the keypad, digit by digit, then the work moment.
- Three documents arriving one by one, each from the same stamp.

## Outro / punchline
The horizontal reversed wordmark on Fjord, then the slogan: **"Tiden tickar.
Tikkr räknar."** Lands on a strong beat. `tikkr.se` sits quietly underneath.

## User flow worth showing
Entry, key action, result, exactly as the kiosk works:
1. Name grid, operator taps their own name.
2. Order number on the keypad ("2601"), then the work moment ("Svetsning").
3. Back on the grid, that card is now green and carries "2601 · Svetsning".

This is the centrepiece. Scene 2 is the flow; scene 3 is the consequence.

## Tone
- Preset: polished
- Creative direction: Swedish industrial restraint. Built by people who care
  about details, not an American startup translated into Swedish.
- Interpretation: four scenes, long holds, no flourish. Confidence comes from
  how little the video does. Nothing bounces, nothing spins, nothing glows.

## Format: landscape, 1920x1080 (vertical 1080x1920 rendered after)
## Duration: 20.75 seconds

## Visual identity (from the project)
Six colours exist and no more. Source: `src/lib/brand.ts` and
`src/app/globals.css`. Do not introduce a seventh.

- Background (dark): Fjord `#0E1A2B`
- Background (light): Snö `#F5F6F2`
- Accent on light: Tick Deep `#0F9E68`, the clocked-in card fill
- Accent on dark: Tick `#2ED196`, small labels only
- Text on light: Fjord `#0E1A2B`; secondary text: Skiffer `#5B6573`
- Lines and card borders: Lav `#D9DDD6`
- Display and body font: **Geist** (Semibold 600 headings, Medium 500 labels,
  Regular 400 body). Tracking: minus 3% on large headings.
- Strongest visual element: the employee card flipping from white to Tick Deep
  green with white text.

**Green is accent, never the dominant surface.** It appears on the clocked-in
card, on the three document kickers and on the section numbers. Fjord and Snö
carry every frame.

### The sales page's own visual language (added after the first cut)

The first cut used the brand's colours and typeface but none of the devices
that make tikkr.se look like itself. Colour tokens are not a graphic profile.
Four things carry it, all lifted from `src/components/marketing/`:

- **The motif** (`Motif.tsx`) — the brand symbol's two half-circles blown up to
  well over a thousand pixels, bleeding past a corner, at 5% and 10% opacity
  (Snö over Fjord, Fjord over Snö). The halves differ from each other on
  purpose; read as one circle with a notch, the mark loses its whole point,
  which is that there are two: the clock-in and the clock-out. The same form
  appears in every scene and the placement alternates corner to corner, exactly
  as the page does it. Its flat edge must sit outside the frame — visible, it
  reads as a slab instead of an arc.
- **The numbered section label** (`SectionHead`) — `01 —— Problemet`: the
  number in green, a short rule, the label uppercase with wide tracking. The
  video's three content scenes carry 01, 02 and 03. The page's own numbering
  runs 01, 02, 04 for these sections, but a viewer who cannot see section 03
  would read that as a mistake.
- **The product panel** — the hero does not show the clock-in screen full
  bleed. It shows it as a light panel with a label above it, floating on Fjord
  under a deep shadow. The difference is not decoration: the panel says this is
  *a screen you are looking at*, not rows of cards floating in a picture.
- **The document card** (`Documents()`) — a rule, a green uppercase kicker, then
  the title. "Till kunden / Underlag per order" replaced the earlier sublines,
  and it is the page's own copy.

**Consequence for contrast.** Tick Deep on Snö is 3.17:1 and white on Tick Deep
is 3.44:1. Both clear WCAG AA for *large* text (3:1) and fail it for normal text
(4.5:1), and the boundary is 24px. Every green label and every white-on-green
line in this video is therefore set above 24px. Darkening the green would have
been the easy fix and would have added a seventh colour.

**The wordmark is never set as type.** Use
`public/brand/tikkr-logo-horizontal-reversed.svg` on Fjord. Never render the
letters "tikkr" as a text node in any scene.

## Share copy (draft)
Tikkr är live. Stämpling per order och arbetsmoment på en pekskärm i verkstaden.
En timme registrerad en gång blir underlag till kundens faktura, till
efterkalkylen och till lönen. tikkr.se

## Audio direction
- Role: sparse professional accents over a restrained bed
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM).
  Track 10 was the first choice and was rejected on listening. Track 12 has the
  same tempo but a different phase: the two beat grids are effectively identical
  from 8.7s onward and differ only at the start, so swapping cost a re-time of
  the first eight seconds and nothing else. The wordmark landing even improved,
  from a 0.97-strength cue to a 0.99 one.
- Music treatment: in from 0.00 at 0.5 volume, no fade-in longer than 0.3s,
  fade out over the last 0.8s. Never rises above 0.5. There is no voice to duck
  for, but the tone asks for a bed, not a soundtrack.
- Music cue guidance: beat grid every ~0.546s. Scene boundaries sit on beats:
  4.10 / 11.47 / 16.93 / 20.74. Strong cues at 18.01, 18.55, 20.19, 20.74, so
  land the wordmark on 18.55 and end on 20.74. Sequential card reveals in
  scene 3 use every other beat (11.47, 12.56, 13.64).
- Audio-reactive treatment: none. Polished restraint, and an industrial product
  should not pulse to music.
- SFX posture: sparse. Four kinds of sound in the whole video, no more: one
  interface tap when the name is pressed, four short key ticks for the four
  digits, one soft confirm when the card turns green, one low impact under the
  wordmark.
- Audio-coupled moments: the keypad digits (key ticks on beats), the card
  turning green (confirm), the three documents arriving (one quiet tick each).
- Restraint rule: no whooshes, no risers, no stingers on text entrances. If a
  sound is not matched to something the viewer sees being pressed or arriving,
  it does not belong.

## Storyboard

### Scene 1 — Frågan — 4.1s
Full Fjord. Nothing else in frame. Small Tick label top left: "STÄMPLING PER
ORDER" (uppercase, plus 8% tracking, small). The headline slams in at 0.27 on
the first beat, white Geist Semibold, very large: **"Vad gjordes på tisdagen?"**
Holds settled from 0.6 to 2.4. At 2.46 a second line fades in beneath it in
Skiffer: **"På fredagen ska någon minnas."** Holds to 4.10. Two reads, both
above the floor. No motion other than the two entrances.
Sequential/interaction: none.
Audio intent: the bed establishes, nothing punctuates. The question should feel
like it was already true before the video started.
Audio-coupled idea: none.
Music: restrained, present from frame one.
Transition mood: clean, to Scene 2

### Scene 2 — Stämplingsskärmen — 7.4s
Hard cut to Snö. This is a recreation of the real kiosk screen, not a mockup of
a concept. Six employee cards in a 3x2 grid, each a white rounded card with a
Lav border: a round grey avatar circle on the left, the name in Fjord Semibold
next to it, and "Ej instämplad" in small Skiffer text at the bottom. Names:
Anna Lind, Johan Berg, Mikael Ek, Sara Holm, Erik Dahl, Lena Nyström.
Cards arrive 0.08s apart from 4.10, the set fully readable by 4.9 and held.

At 5.74 a cursor presses **Anna Lind** (card depresses 2px, interface tap).
At 6.28 the frame replaces the grid with the keypad view: heading "Slå in
ordernummer" in Fjord, a large empty field, and a 3x4 numeric keypad of white
keys with Lav borders. Digits appear one per beat with a key tick: **2** at
6.82, **6** at 7.35, **0** at 7.79, **1** at 8.22. The field reads "2601".
At 8.73 cut to the moment list: heading "Välj arbetsmoment", four white rows:
Svetsning, Fräsning, Lackering, Montering. Cursor presses **Svetsning** at 9.29.
At 9.83 we are back on the name grid and Anna Lind's card is now filled Tick
Deep green, her name in white, and underneath it in white Semibold: **"2601 ·
Svetsning"**. Soft confirm sound. The other five cards stay white, unchanged.
Hold to 11.47. No caption over this scene; the screen explains itself.
Sequential/interaction: yes. Cards reveal one by one; the cursor presses a name,
four digits and a work moment; the card fills green as the result.
Audio intent: the sound of something being operated, not demonstrated. Dry,
short, mechanical.
Audio-coupled idea: interface tap on the name press, four key ticks on the
digits, one soft confirm at 9.83 when the card turns green.
Transition mood: clean, to Scene 3

### Scene 3 — Tre underlag — 5.5s
Stay on Snö. The green card from scene 2 shrinks to the top-left corner and
holds there as the origin of everything that follows, with a thin Lav line
running from it. Heading in Fjord Semibold: **"En stämpling. Tre underlag."**
Three white cards with Lav borders arrive one per two beats, each holding a
label in Fjord Semibold and one line of Skiffer beneath:
- 11.47, **Underlag per order**, "till kundens faktura"
- 12.56, **Efterkalkyl**, "till er egen lönsamhet"
- 13.64, **Tidrapport**, "till lönen"

All three settled and held together from 14.2 to 16.93, which is the longest
single hold in the video and the point the whole thing is making.
Sequential/interaction: yes, three cards one by one on every other beat, each
label well above the 0.8s floor, full set held 2.7s afterwards.
Audio intent: quiet accumulation. Three small arrivals, each the same weight.
Audio-coupled idea: one short, quiet tick per card arrival. Nothing louder than
the confirm in scene 2.
Transition mood: soft crossfade, to Scene 4

### Scene 4 — Avslut — 3.8s
Crossfade to full Fjord. The horizontal reversed wordmark SVG fades up centred
and lands settled on the strong cue at **18.55**. At 19.10 the slogan appears
beneath it in white Geist Medium: **"Tiden tickar. Tikkr räknar."** At 19.64
`tikkr.se` appears small in Tick. Everything holds to 20.74, where the music
ends on a strong beat. One low impact under the wordmark at 18.55 and nothing
after it.
Sequential/interaction: none.
Audio intent: arrival and stop. The last half second is silent.
Audio-coupled idea: single low impact on the wordmark landing.
Transition mood: hard stop.

**Music mood for this video:** upbeat but held back, a professional bed at half
volume, never a soundtrack.
**Audio summary:** a restrained 110 BPM bed runs the full 20.7 seconds with
exactly four kinds of sound on top, every one of them matched to something the
viewer sees being pressed or arriving, ending on a strong beat with the wordmark.

## Text inventory (no narration, so every word the viewer reads)
| Scene | Text | Read floor | Settled hold |
|---|---|---|---|
| 1 | STÄMPLING PER ORDER | 0.8s | 3.8s |
| 1 | Vad gjordes på tisdagen? | 1.2s | 1.8s |
| 1 | På fredagen ska någon minnas. | 1.5s | 1.6s |
| 2 | 6 names plus "Ej instämplad" | 0.8s | 1.6s |
| 2 | Slå in ordernummer | 0.8s | 2.4s |
| 2 | Välj arbetsmoment plus 4 moment | 0.8s | 1.1s |
| 2 | 2601 · Svetsning | 0.8s | 1.6s |
| 3 | En stämpling. Tre underlag. | 1.2s | 5.4s |
| 3 | 3 card labels plus sublines | 0.9s each | 3.3s together |
| 4 | Tiden tickar. Tikkr räknar. | 1.2s | 1.6s |
| 4 | tikkr.se | 0.8s | 1.1s |

## Language rules that bind this video (project TONE-OF-VOICE.md)
Every word above is customer-facing Swedish and follows the project's own rules.
- Say **stämplingsskärm**, never *kiosk*. Say **order**, **arbetsmoment**,
  **underlag**, **efterkalkyl**, **tidrapport**. These are fixed terms with one
  name each. **Rapport** and **tidrapport** are different documents; this video
  only says tidrapport.
- Headings are nouns. No sentence describes what is already visible on screen.
- Never write: smidigt och enkelt, ta kontroll över, få full koll på, sömlöst,
  kraftfullt, effektivisera, allt du behöver, med Tikkr kan du.
- No em-dash afterthoughts in on-screen copy.
- Any time shown must be written tim:min, never decimal. This video shows no
  durations, so the rule is satisfied by showing none.
