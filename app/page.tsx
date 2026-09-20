import Link from "next/link";

import { HomeOnboarding } from "@/components/HomeOnboarding";

const FEATURES = [
  {
    title: "Height becomes pitch",
    body: "The value of the function drives the frequency between 150 and 800 hertz, on an exponential scale so equal steps sound equal.",
    accent: "text-cyan-400",
  },
  {
    title: "Position becomes stereo",
    body: "Moving the cursor left pushes the sound into your left ear, moving right pushes it to the right. The x axis lives in the stereo field.",
    accent: "text-fuchsia-400",
  },
  {
    title: "Slope becomes timbre",
    body: "A rising curve is a clean sine wave. A falling curve blends in a sawtooth and opens a filter, so direction is audible instantly.",
    accent: "text-emerald-400",
  },
  {
    title: "Critical points become earcons",
    body: "A crystalline bell marks a local maximum, a deep thud marks a local minimum, a soft chord marks an inflection point, and a harsh glitch marks a discontinuity.",
    accent: "text-amber-300",
  },
  {
    title: "Surfaces become space",
    body: "z = f(x, y) is scanned along an Archimedean spiral. Height is pitch, x is left and right, y is in front of and behind your head.",
    accent: "text-sky-300",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
      <HomeOnboarding />
      <section className="max-w-3xl">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs font-medium uppercase tracking-widest text-cyan-300">
          Data sonification
        </p>
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
          See mathematics <span className="text-cyan-400">with your ears</span>.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-zinc-400">
          Ondas translates solids, plane figures, curves and surfaces into spatial sound in real
          time. Geometry becomes something you can hear, follow and navigate, entirely from the
          keyboard or by voice.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/functions"
            className="rounded-lg bg-cyan-400 px-6 py-3 font-semibold text-zinc-950 transition-colors hover:bg-cyan-300"
          >
            Explore 2D functions
          </Link>
          <Link
            href="/multivariable"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 font-semibold text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Explore surfaces f(x, y)
          </Link>
          <Link
            href="/2d-shapes"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 font-semibold text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Trace 2D shapes
          </Link>
          <Link
            href="/3d-shapes"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-6 py-3 font-semibold text-zinc-100 transition-colors hover:bg-zinc-800"
          >
            Browse the 3D library
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="mt-20">
        <h2 id="how-it-works" className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          How the sonification works
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-700"
            >
              <h3 className={`text-lg font-semibold ${feature.accent}`}>{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="getting-started" className="mt-16 max-w-3xl">
        <h2 id="getting-started" className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Getting started
        </h2>
        <ol className="mt-6 space-y-3 text-zinc-400">
          <li>
            <span className="font-semibold text-zinc-200">1.</span> Put on headphones. Stereo and
            spatial placement carry most of the information.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">2.</span> Open the functions explorer and
            press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">Enter</kbd> on
            the enable audio button. Browsers only allow sound after a deliberate action.
          </li>
          <li>
            <span className="font-semibold text-zinc-200">3.</span> Use the{" "}
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">←</kbd> and{" "}
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">→</kbd> keys to
            move the cursor along the curve, or press{" "}
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200">Shift + V</kbd> to
            enable the microphone, then say{" "}
            <span className="font-medium text-zinc-200">Hey Ondas</span> followed by a command. Say{" "}
            <span className="font-medium text-zinc-200">Hey Ondas, skip</span> to stop this welcome.
          </li>
        </ol>
      </section>
    </div>
  );
}
