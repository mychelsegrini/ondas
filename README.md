# Ondas

**Hear the shape of mathematics.**

Ondas is a data sonification web app that teaches geometry and calculus to visually impaired
learners by turning solids, plane figures, curves and surfaces into spatial sound in real time.
Every feature is reachable from the keyboard alone, from a screen reader, or by voice.

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
| Discontinuity | Noise burst plus clashing squares | Harsh glitch |
| Corner of a polygon | Metallic click | Short tick you can count |
| 3D position | `Panner3D` with an HRTF model | Depth becomes distance and direction |
| z = f(x, y) | Oscillator frequency along an Archimedean spiral | Surface height becomes pitch |
| x of a surface | `Panner3D.positionX` | Left and right around the head |
| y of a surface | `Panner3D.positionZ` | Front and back around the head |

## Pages

### `/functions` — Planar Waves (the hero feature)

Type or dictate any `y = f(x)`, set `x min` and `x max` freely, and walk the curve sample by sample.
`mathjs` computes the symbolic first and second derivatives (falling back to central differences for
expressions it cannot differentiate, such as `abs(x)`), then bisection refines every sign change of
`f′` into an exact maximum or minimum and every sign change of `f″` into an inflection point.

Discontinuities are detected as well, and split into two kinds: a **pole**, where the function is
defined on both sides but the value explodes (`1/x`, `tan(x)`), and a **gap**, where the function
leaves the reals entirely (`sqrt(x)` and `log(x)` below zero). Adjacent flagged samples are
clustered so a single asymptote fires once rather than a dozen times. Crossing either kind plays
the glitch earcon, and neither is ever mistaken for an extremum.

**Cursor speed** is adjustable from 0.2× to 5× with a slider, a numeric field, or the voice command
"set speed to two x". It scales both the arrow keys and the automatic sweep. At high speeds a
single key press can jump over a feature, so earcons are matched against the whole travelled span
rather than just the landing sample.

### `/multivariable` — Surface Waves

Type any `z = f(x, y)`. The scan does not raster row by row, which would be an auditory mess.
It follows an Archimedean spiral from the origin outward:

```
x(t) = a · t · cos(b · t)
y(t) = a · t · sin(b · t)
```

`a` is the domain radius and `b` is `2π × turns`, so each revolution takes the same time while the
radius grows. Height is pitch, x is left/right, and y is front/back through `Tone.Panner3D`.
Frequency and panner position are ramped between samples so the motion reads as a continuous
texture. A bell marks a peak along the path, a thud a valley, and a glitch a hole where the
surface is undefined.

### `/2d-shapes` — Flat Waves

Square, rectangle, equilateral triangle, circle, regular pentagon and regular hexagon. Selecting
one traces its perimeter at constant speed: horizontal position drives the stereo balance, height
drives the pitch *and* the level of a third harmonic so the top of a shape is audibly brighter, and
every corner fires a metallic click. Because the trace moves at constant speed, travel time is
proportional to side length — which is exactly what separates the square from the rectangle by ear.

### `/3d-shapes` — Spatial Waves

A **single random point** first, then sphere, cube, rectangular prism, triangular prism, cylinder,
cone, pyramid and ellipsoid. Selecting a solid runs an automatic spatial scan: a tone travels along
a parametric path through a 3D panner while a short click marks every sharp change of direction.
The line drawing on each card is the exact path being scanned, so the visual and the audio are the
same data.

The four prismatic solids (cube, both prisms, cylinder) share one scan model: identical horizontal
cross sections stacked at regular heights, each traced in full before the scan steps up. A constant
cross section therefore sounds like one repeating orbit at rising pitches, which is what makes the
cylinder immediately distinguishable from the cone, whose orbit shrinks as it rises.

The random point has no path at all. Clicking it generates a fresh coordinate on a sphere around
the listener, moves the `Panner3D` there, and fires a two note ping from that direction — a pair
rather than a single click, because one isolated click is much harder to localise. It is the
recommended way to calibrate your ears before attempting the solids.

## Keyboard

| Keys | Action |
| --- | --- |
| `←` `→` | Move the cursor along the curve at the current speed |
| `Shift` + `←` `→` | Move five times further |
| `Home` / `End` | Jump to the start or end of the domain |
| `N` / `P` | Next or previous critical point |
| `D` | Describe the current position aloud |
| `Space` | Automatic sweep of the whole curve, or the surface spiral |
| `Esc` | Stop the current scan |
| `1`–`9` | Scan the corresponding shape (either shapes page) |
| `Shift` + `V` | Toggle voice commands |

## Voice commands

The microphone is global: one listener serves the whole app and pages register their own handlers.
Final transcripts are posted to `/api/voice`, which asks Meta's Model API (Muse) to classify the
phrase into a JSON command. If the key is missing, the network fails, or the model reply does not
validate, a deterministic local parser takes over so voice never depends on the cloud.

Requires the Web Speech API (Chrome or Edge). Everything it does is also possible from the keyboard.

```
set function to sine x times x      set x min to minus five
plot x squared minus four           set x max to twelve
graph cosine x plus x squared       set the domain from minus three to three
set speed to two x                  auto play
go to the maximum                   next critical point
move right                          where am I
select the sphere                   select the hexagon
open the 2d shapes library          open the 3d shapes library
set the surface to sine x times cosine y
open the surface explorer           help
stop
```

Copy `.env.example` to `.env.local` and set `META_API_KEY` to enable the language-model router.

Spoken mathematics is normalised before parsing, so "sine of x times x" becomes `sin(x)*x` rather
than `sin(x*x)`, number words become digits, and unclosed parentheses are balanced. Shape names are
resolved across both libraries with a longest-match rule, so "triangular prism" is never heard as
"triangle".

## Folder structure

```
app/
  layout.tsx            Root layout, skip link, voice provider, live region
  page.tsx              Landing page explaining the sonification model
  globals.css           Tailwind v4 entry, focus rings, reduced motion
  functions/page.tsx    Planar Waves
  multivariable/page.tsx Surface Waves (Suspense boundary for search params)
  2d-shapes/page.tsx    Flat Waves (Suspense boundary for search params)
  3d-shapes/page.tsx    Spatial Waves (Suspense boundary for search params)
  api/voice/route.ts    LLM command router with local-parser fallback
components/
  FunctionExplorer.tsx  Hero page: inputs, speed control, cursor, earcon triggering
  FunctionGraph.tsx     Canvas renderer: grid, curve, critical points, breaks, cursor
  SurfaceExplorer.tsx   Multivariable explorer: spiral scan, domain, presets
  SurfaceVisual.tsx     Heatmap of z = f(x, y) with the Archimedean path overlaid
  Shapes2DExplorer.tsx  Polygon gallery, perimeter trace control, detail panel
  Shape2DVisual.tsx     Renders a polygon outline to SVG with a live scan head
  ShapesExplorer.tsx    Solid gallery, scan control, random point, detail panel
  ShapeVisual.tsx       Projects a 3D scan path to SVG with a live scan head
  RandomPointVisual.tsx Plan view of the last random ping around the listener
  SiteHeader.tsx        Navigation
  VoiceBar.tsx          Microphone control and transcript
contexts/
  VoiceContext.tsx      Global speech recognition, LLM routing, handler registry
lib/
  audio/mappings.ts           Shared maths-to-sound mappings and earcon kinds
  audio/useSonification.ts    Tone.js graph for the 2D cursor tone, earcons, auto-play
  audio/useSurfaceSonification.ts  Panner3D spiral scan for z = f(x, y)
  audio/usePolygonSonification.ts  Perimeter trace engine for the 2D library
  audio/useShapeSonification.ts    Panner3D scan and ping engine for the 3D library
  math/analyze.ts             Sampling, derivatives, critical points, discontinuities
  math/surface.ts             f(x, y) evaluation and Archimedean spiral sampling
  shapes.ts                   The solids, their scan paths, and random point helpers
  shapes2d.ts                 The six plane figures and their perimeter paths
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

Prints the detected critical points and discontinuities for a set of reference functions, plus the
parse result of every example voice command. `x^4 - 4x^2` should give minima at ±√2, a maximum at 0
and inflections at ±√(2/3); `tan(x)` on [−4.5, 4.5] should give poles at ±π/2 and nothing else;
`sqrt(x)` should give a single gap at 0.

## Tech stack

Next.js (App Router) · React · Tailwind CSS v4 · Framer Motion · Tone.js · mathjs · Web Speech API
