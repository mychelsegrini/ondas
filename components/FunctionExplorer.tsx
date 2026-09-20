"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CRITICAL_COLORS, FunctionGraph } from "@/components/FunctionGraph";
import { useVoiceCommands, useVoiceHandler } from "@/components/VoiceCommandProvider";
import { slopeToTimbre, xToPan, yToFrequency } from "@/lib/audio/mappings";
import { useSonification } from "@/lib/audio/useSonification";
import {
  analyzeFunction,
  describeCriticalPoint,
  describeSlope,
  formatNumber,
  type CriticalKind,
  type CriticalPoint,
} from "@/lib/math/analyze";

const PRESETS = [
  { label: "x^2", expression: "x^2", xMin: -5, xMax: 5 },
  { label: "sin(x)", expression: "sin(x)", xMin: -6.283, xMax: 6.283 },
  { label: "sin(x) * x", expression: "sin(x) * x", xMin: -10, xMax: 10 },
  { label: "x^3 - 3x", expression: "x^3 - 3*x", xMin: -3, xMax: 3 },
  { label: "e^(-x^2)", expression: "exp(-x^2)", xMin: -3, xMax: 3 },
  { label: "x^4 - 4x^2", expression: "x^4 - 4*x^2", xMin: -2.5, xMax: 2.5 },
];

const KIND_LABEL: Record<CriticalKind, string> = {
  max: "Local maximum",
  min: "Local minimum",
  inflection: "Inflection point",
};

const KIND_EARCON: Record<CriticalKind, string> = {
  max: "crystalline bell",
  min: "deep thud",
  inflection: "soft chord",
};

const SWEEP_SECONDS = 9;
const IDLE_FADE_MS = 1400;
/** How close, in samples, the cursor must be for a critical point to fire. */
const EARCON_TOLERANCE = 3;

export function FunctionExplorer() {
  const { announce } = useVoiceCommands();
  const { isReady, status, error: audioError, start, update, playTone, stopTone, playEarcon } =
    useSonification();

  const [expression, setExpression] = useState("sin(x) * x");
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [expressionDraft, setExpressionDraft] = useState("sin(x) * x");
  const [xMinDraft, setXMinDraft] = useState("-10");
  const [xMaxDraft, setXMaxDraft] = useState("10");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const graphRef = useRef<HTMLDivElement | null>(null);
  const previousIndexRef = useRef(0);
  const lastEarconRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sweepFrameRef = useRef<number | null>(null);

  const analysis = useMemo(() => analyzeFunction(expression, xMin, xMax), [expression, xMin, xMax]);
  const sampleCount = analysis.points.length;
  const current = analysis.points[cursorIndex];

  const criticalByKind = useMemo(() => {
    const counts: Record<CriticalKind, CriticalPoint[]> = { max: [], min: [], inflection: [] };
    for (const point of analysis.criticalPoints) counts[point.kind].push(point);
    return counts;
  }, [analysis]);

  useEffect(() => {
    setCursorIndex(0);
    previousIndexRef.current = 0;
    lastEarconRef.current = null;
  }, [analysis]);

  const markActivity = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    playTone();
    idleTimerRef.current = setTimeout(() => stopTone(), IDLE_FADE_MS);
  }, [playTone, stopTone]);

  // The heart of the sonification: every cursor move retunes the continuous tone
  // and fires an earcon when a critical point is crossed.
  useEffect(() => {
    if (!isReady || !current) return;

    const { sawMix, cutoff } = slopeToTimbre(current.dy);
    update({
      frequency: yToFrequency(current.y, analysis.yMin, analysis.yMax),
      pan: xToPan(current.x, analysis.xMin, analysis.xMax),
      sawMix,
      cutoff,
    });

    const previous = previousIndexRef.current;
    previousIndexRef.current = cursorIndex;

    const low = Math.min(previous, cursorIndex) - EARCON_TOLERANCE;
    const high = Math.max(previous, cursorIndex) + EARCON_TOLERANCE;
    const crossed = analysis.criticalPoints
      .filter((point) => point.index >= low && point.index <= high)
      .sort((a, b) => Math.abs(a.index - cursorIndex) - Math.abs(b.index - cursorIndex))[0];

    if (!crossed) {
      lastEarconRef.current = null;
      return;
    }
    // Do not retrigger while the cursor lingers on the same feature.
    if (lastEarconRef.current === crossed.index) return;
    lastEarconRef.current = crossed.index;
    playEarcon(crossed.kind);
    announce(describeCriticalPoint(crossed));
  }, [analysis, announce, current, cursorIndex, isReady, playEarcon, update]);

  const moveCursor = useCallback(
    (delta: number) => {
      if (sampleCount === 0) return;
      setCursorIndex((index) => Math.min(sampleCount - 1, Math.max(0, index + delta)));
      markActivity();
    },
    [markActivity, sampleCount],
  );

  const goToIndex = useCallback(
    (index: number) => {
      if (sampleCount === 0) return;
      setCursorIndex(Math.min(sampleCount - 1, Math.max(0, index)));
      markActivity();
    },
    [markActivity, sampleCount],
  );

  const stopSweep = useCallback(() => {
    if (sweepFrameRef.current !== null) {
      cancelAnimationFrame(sweepFrameRef.current);
      sweepFrameRef.current = null;
    }
    setIsSweeping(false);
  }, []);

  const startSweep = useCallback(async () => {
    if (!isReady) {
      const started = await start();
      if (!started) return;
    }
    stopSweep();
    setIsSweeping(true);
    playTone();
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / (SWEEP_SECONDS * 1000));
      setCursorIndex(Math.round(progress * (sampleCount - 1)));
      if (progress >= 1) {
        sweepFrameRef.current = null;
        setIsSweeping(false);
        markActivity();
        return;
      }
      sweepFrameRef.current = requestAnimationFrame(tick);
    };
    sweepFrameRef.current = requestAnimationFrame(tick);
  }, [isReady, markActivity, playTone, sampleCount, start, stopSweep]);

  const jumpToCritical = useCallback(
    (target: "max" | "min" | "inflection" | "next" | "previous") => {
      const points = analysis.criticalPoints;
      if (points.length === 0) {
        announce("This function has no critical points on the current domain.");
        return;
      }
      let destination: CriticalPoint | undefined;
      if (target === "next") {
        destination = points.find((point) => point.index > cursorIndex + EARCON_TOLERANCE);
      } else if (target === "previous") {
        destination = [...points].reverse().find((point) => point.index < cursorIndex - EARCON_TOLERANCE);
      } else {
        const ofKind = criticalByKind[target];
        destination =
          ofKind.find((point) => point.index > cursorIndex + EARCON_TOLERANCE) ?? ofKind[0];
      }
      if (!destination) {
        announce(`No ${target === "next" || target === "previous" ? "further" : KIND_LABEL[target].toLowerCase()} point in that direction.`);
        return;
      }
      goToIndex(destination.index);
    },
    [analysis.criticalPoints, announce, criticalByKind, cursorIndex, goToIndex],
  );

  const describeCursor = useCallback(() => {
    if (!current) return;
    const nearest = analysis.criticalPoints
      .map((point) => ({ point, distance: Math.abs(point.x - current.x) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const concavity = !Number.isFinite(current.d2y)
      ? ""
      : current.d2y > 0.02
        ? " Concave up."
        : current.d2y < -0.02
          ? " Concave down."
          : "";
    const nearestText = nearest
      ? ` Nearest feature: ${KIND_LABEL[nearest.point.kind].toLowerCase()} at x ${formatNumber(nearest.point.x)}.`
      : "";
    announce(
      `x ${formatNumber(current.x)}, y ${formatNumber(current.y)}. The curve is ${describeSlope(current.dy)}, slope ${formatNumber(current.dy)}.${concavity}${nearestText}`,
    );
  }, [analysis.criticalPoints, announce, current]);

  const applyDraft = useCallback(
    (nextExpression: string, nextXMin: number, nextXMax: number) => {
      const candidate = analyzeFunction(nextExpression, nextXMin, nextXMax, 64);
      if (candidate.error) {
        setFormError(candidate.error);
        announce(candidate.error);
        return false;
      }
      setFormError(null);
      setExpression(nextExpression);
      setXMin(nextXMin);
      setXMax(nextXMax);
      setExpressionDraft(nextExpression);
      setXMinDraft(String(nextXMin));
      setXMaxDraft(String(nextXMax));
      announce(
        `Plotting y equals ${nextExpression} from x ${formatNumber(nextXMin)} to ${formatNumber(nextXMax)}. ${candidate.criticalPoints.length === 0 ? "No critical points found." : ""}`,
      );
      return true;
    },
    [announce],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextMin = Number(xMinDraft);
    const nextMax = Number(xMaxDraft);
    if (applyDraft(expressionDraft.trim(), nextMin, nextMax)) {
      graphRef.current?.focus();
    }
  };

  // Global keyboard control. Arrows drive the cursor unless a field has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      // Space must still activate whatever control currently has focus.
      const isControl =
        target && (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "SELECT");
      if (event.key === " " && isControl) return;

      const coarse = event.shiftKey ? 20 : 1;
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          stopSweep();
          moveCursor(coarse);
          break;
        case "ArrowLeft":
          event.preventDefault();
          stopSweep();
          moveCursor(-coarse);
          break;
        case "Home":
          event.preventDefault();
          goToIndex(0);
          break;
        case "End":
          event.preventDefault();
          goToIndex(sampleCount - 1);
          break;
        case "n":
          event.preventDefault();
          jumpToCritical("next");
          break;
        case "p":
          event.preventDefault();
          jumpToCritical("previous");
          break;
        case "d":
          event.preventDefault();
          describeCursor();
          break;
        case " ":
          event.preventDefault();
          if (isSweeping) stopSweep();
          else void startSweep();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    describeCursor,
    goToIndex,
    isSweeping,
    jumpToCritical,
    moveCursor,
    sampleCount,
    startSweep,
    stopSweep,
  ]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (sweepFrameRef.current !== null) cancelAnimationFrame(sweepFrameRef.current);
    };
  }, []);

  useVoiceHandler((command) => {
    switch (command.type) {
      case "setFunction":
        applyDraft(command.expression, xMin, xMax);
        return true;
      case "setXMin":
        applyDraft(expression, command.value, xMax);
        return true;
      case "setXMax":
        applyDraft(expression, xMin, command.value);
        return true;
      case "setDomain":
        applyDraft(expression, command.min, command.max);
        return true;
      case "moveCursor":
        moveCursor((command.direction === "right" ? 1 : -1) * (command.fast ? 60 : 12));
        return true;
      case "jump":
        if (command.target === "start") goToIndex(0);
        else if (command.target === "end") goToIndex(sampleCount - 1);
        else jumpToCritical(command.target);
        return true;
      case "describe":
        describeCursor();
        return true;
      case "audio":
        if (command.action === "start") void start().then(() => markActivity());
        else {
          stopSweep();
          stopTone();
        }
        return true;
      case "help":
        announce(
          "Say set function to x squared, set x min to minus five, go to the maximum, next critical point, or where am I. Use the left and right arrow keys to move along the curve.",
        );
        return true;
      default:
        return false;
    }
  });

  const cursorSummary = current
    ? `x ${formatNumber(current.x)}, y ${formatNumber(current.y)}, slope ${formatNumber(current.dy)}, ${describeSlope(current.dy)}`
    : "No sample under the cursor.";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Planar Waves</h1>
        <p className="mt-3 text-zinc-400">
          Type or dictate any function of x, choose the domain, then walk the curve with the arrow
          keys. Height becomes pitch, horizontal position becomes stereo placement, and the slope
          reshapes the timbre. Maxima, minima and inflection points announce themselves with their
          own earcons.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby="audio-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 id="audio-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Audio engine
            </h2>
            <button
              type="button"
              onClick={() => void start().then(() => markActivity())}
              disabled={isReady || status === "starting"}
              className="mt-3 w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-400"
            >
              {isReady ? "Audio ready — move with ← and →" : status === "starting" ? "Starting…" : "Enable audio"}
            </button>
            {audioError ? (
              <p role="alert" className="mt-2 text-sm text-rose-400">
                {audioError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                Browsers require a click or key press before any sound can play. Headphones
                recommended for the stereo axis.
              </p>
            )}
            <button
              type="button"
              onClick={() => (isSweeping ? stopSweep() : void startSweep())}
              className="mt-3 w-full rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
            >
              {isSweeping ? "Stop automatic sweep" : "Play automatic sweep"}
              <kbd className="ml-2 rounded border border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-400">
                Space
              </kbd>
            </button>
          </section>

          <section aria-labelledby="function-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 id="function-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Function and domain
            </h2>
            <form onSubmit={handleSubmit} className="mt-3 space-y-4">
              <div>
                <label htmlFor="expression" className="block text-sm font-medium text-zinc-300">
                  y = f(x)
                </label>
                <input
                  id="expression"
                  name="expression"
                  value={expressionDraft}
                  onChange={(event) => setExpressionDraft(event.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby="expression-hint"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-cyan-300 placeholder:text-zinc-600 focus:border-cyan-400"
                  placeholder="sin(x) * x"
                />
                <p id="expression-hint" className="mt-1 text-xs text-zinc-500">
                  Anything mathjs understands: <span className="font-mono">x^2</span>,{" "}
                  <span className="font-mono">sin(x)/x</span>, <span className="font-mono">exp(-x^2)</span>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="x-min" className="block text-sm font-medium text-zinc-300">
                    x min
                  </label>
                  <input
                    id="x-min"
                    name="x-min"
                    type="number"
                    step="any"
                    value={xMinDraft}
                    onChange={(event) => setXMinDraft(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-200 focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="x-max" className="block text-sm font-medium text-zinc-300">
                    x max
                  </label>
                  <input
                    id="x-max"
                    name="x-max"
                    type="number"
                    step="any"
                    value={xMaxDraft}
                    onChange={(event) => setXMaxDraft(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-200 focus:border-cyan-400"
                  />
                </div>
              </div>

              {formError || analysis.error ? (
                <p role="alert" className="text-sm text-rose-400">
                  {formError ?? analysis.error}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-cyan-300"
              >
                Plot and analyse
              </button>
            </form>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">Presets</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <li key={preset.label}>
                  <button
                    type="button"
                    onClick={() => applyDraft(preset.expression, preset.xMin, preset.xMax)}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-300 transition-colors hover:border-cyan-500 hover:text-cyan-300"
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="keys-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 id="keys-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Keyboard
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["← →", "Move the cursor one sample"],
                ["Shift + ← →", "Move twenty samples"],
                ["Home / End", "Jump to the start or end of the domain"],
                ["N / P", "Next or previous critical point"],
                ["D", "Describe the current position"],
                ["Space", "Automatic sweep of the whole curve"],
                ["Shift + V", "Toggle voice commands"],
              ].map(([keys, description]) => (
                <div key={keys} className="flex items-baseline justify-between gap-4">
                  <dt>
                    <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="flex-1 text-right text-zinc-400">{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <section
            ref={graphRef}
            tabIndex={0}
            role="application"
            aria-roledescription="Interactive sonified graph"
            aria-label={`Graph of y equals ${expression} from x ${formatNumber(xMin)} to x ${formatNumber(xMax)}`}
            aria-describedby="graph-instructions graph-readout"
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
          >
            <p id="graph-instructions" className="sr-only">
              Use the left and right arrow keys to move the cursor along the curve. Press D to
              describe the current position, N and P to jump between critical points, and space to
              play an automatic sweep.
            </p>
            <div className="h-[26rem] w-full">
              <FunctionGraph analysis={analysis} cursorIndex={cursorIndex} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-sm">
              <p id="graph-readout" className="font-mono text-zinc-200">
                <span className="text-zinc-500">cursor </span>
                {cursorSummary}
              </p>
              <p className="font-mono text-xs text-zinc-500">
                sample {cursorIndex + 1} of {sampleCount}
              </p>
            </div>
          </section>

          <section
            aria-labelledby="critical-heading"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
          >
            <h2 id="critical-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Critical points ({analysis.criticalPoints.length})
            </h2>
            {analysis.criticalPoints.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">
                No maxima, minima or inflection points were found on this domain.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {analysis.criticalPoints.map((point) => (
                  <li key={`${point.kind}-${point.x.toFixed(4)}`}>
                    <button
                      type="button"
                      onClick={() => goToIndex(point.index)}
                      className="flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CRITICAL_COLORS[point.kind] }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-zinc-200">
                          {KIND_LABEL[point.kind]}
                        </span>
                        <span className="block font-mono text-xs text-zinc-500">
                          x {formatNumber(point.x)} · y {formatNumber(point.y)} ·{" "}
                          {KIND_EARCON[point.kind]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
