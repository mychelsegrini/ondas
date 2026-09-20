# Ondas

**Hear the shape of mathematics.**

Ondas is a data sonification web app that teaches geometry and calculus to visually impaired
learners by turning 3D solids and 2D functions into spatial sound in real time. Every feature is
reachable from the keyboard alone, from a screen reader, or by voice.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and **put on headphones** — most of the information lives in the stereo
and spatial field. Browsers block audio until a deliberate user action, so press **Enable audio**
(or simply play a shape scan) before exploring.

## The sonification model

| Mathematical quantity | Audio parameter | What you hear |
| --- | --- | --- |
| y, the function value | Oscillator frequency, 150–800 Hz, exponential | Height becomes pitch |
| x, horizontal position | Stereo panner, −1 to +1 | Position becomes ear placement |
| f′(x), the slope | Sawtooth mix and lowpass cutoff | Rising is a pure sine, falling gets gritty |
| Local maximum | Bell earcon | Bright crystalline chime |
| Local minimum | Membrane earcon | Deep percussive thud |
| Inflection point | Triangle chord earcon | Soft transitional chord |
| 3D position | `Panner3D` with an HRTF model | Depth becomes distance and direction |

## Pages

### `/functions` — Planar Waves (the hero feature)

Type or dictate any `y = f(x)`, set `x min` and `x max` freely, and walk the curve sample by sample.
`mathjs` computes the symbolic first and second derivatives (falling back to central differences for
expressions it cannot differentiate, such as `abs(x)`), then bisection refines every sign change of
`f′` into an exact maximum or minimum and every sign change of `f″` into an inflection point.
Discontinuities are detected and skipped, so `1/x` and `tan(x)` do not report phantom extrema.

### `/shapes` — Spatial Waves

Ten solids — sphere, cube, pyramid, hyperbolic paraboloid, torus, cylinder, cone, ellipsoid, Möbius
strip and dodecahedron. Selecting one runs an automatic spatial scan: a tone travels along a
parametric path through a 3D panner while a short click marks every sharp change of direction, which
is what makes an edge audible. The line drawing on each card is the exact path being scanned, so the
visual and the audio are the same data.

## Keyboard

| Keys | Action |
| --- | --- |
| `←` `→` | Move the cursor one sample along the curve |
| `Shift` + `←` `→` | Move twenty samples |
| `Home` / `End` | Jump to the start or end of the domain |
| `N` / `P` | Next or previous critical point |
| `D` | Describe the current position aloud |
| `Space` | Automatic sweep of the whole curve |
| `1`–`9`, `0` | Scan the corresponding shape (shapes page) |
| `Esc` | Stop the current scan (shapes page) |
| `Shift` + `V` | Toggle voice commands |

## Voice commands

The microphone is global: one listener serves the whole app and pages register their own handlers.
Requires the Web Speech API (Chrome or Edge). Everything it does is also possible from the keyboard.

```
set function to sine x times x      set x min to minus five
plot x squared minus four           set x max to twelve
graph cosine x plus x squared       set the domain from minus three to three
go to the maximum                   next critical point
move right                          where am I
select the sphere                   open the shapes library
help                                stop
```

Spoken mathematics is normalised before parsing, so "sine of x times x" becomes `sin(x)*x` rather
than `sin(x*x)`, number words become digits, and unclosed parentheses are balanced.

## Folder structure

```
app/
  layout.tsx            Root layout, skip link, voice provider, live region
  page.tsx              Landing page explaining the sonification model
  globals.css           Tailwind v4 entry, focus rings, reduced motion
  functions/page.tsx    Planar Waves
  shapes/page.tsx       Spatial Waves (Suspense boundary for search params)
components/
  FunctionExplorer.tsx  Hero page: inputs, keyboard cursor, earcon triggering
  FunctionGraph.tsx     Canvas renderer: grid, curve, critical points, cursor
  ShapesExplorer.tsx    Shape gallery, scan control, detail panel
  ShapeVisual.tsx       Projects a 3D scan path to SVG with a live scan head
  SiteHeader.tsx        Navigation
  VoiceBar.tsx          Microphone control and transcript
  VoiceCommandProvider.tsx  Global speech recognition, handler registry, announcements
lib/
  audio/mappings.ts           Shared maths-to-sound mappings
  audio/useSonification.ts    Tone.js graph for the 2D cursor tone and earcons
  audio/useShapeSonification.ts  Panner3D scan engine for the 3D library
  math/analyze.ts             Sampling, derivatives, critical point detection
  shapes.ts                   The ten solids and their parametric scan paths
  voice/parseCommand.ts       Transcript to structured command
  voice/numberWords.ts        Spoken number handling
scripts/check-math.ts   Sanity check for the analysis and voice parsers
types/speech.d.ts       Web Speech API declarations
```

## Accessibility notes

- A single polite live region in the root layout carries every announcement, so nothing is
  duplicated or shouted over.
- The graph exposes an `application` role with instructions wired through `aria-describedby`, and
  its readout is plain text rather than an image alt.
- Announcements fire on meaningful events only — crossing a critical point, jumping, changing the
  function — never on every sample, which would flood a screen reader.
- Focus is always visible (`:focus-visible` ring), a skip link opens the page, and
  `prefers-reduced-motion` is respected.
- Every critical point is also a button, so the curve can be explored as a list instead of a graph.

## Verifying the maths

```bash
npm run check:math
```

Prints the detected critical points for a set of reference functions (`x^4 - 4x^2` should give
minima at ±√2, a maximum at 0 and inflections at ±√(2/3)) plus the parse result of every example
voice command.

## Tech stack

Next.js (App Router) · React · Tailwind CSS v4 · Framer Motion · Tone.js · mathjs · Web Speech API
