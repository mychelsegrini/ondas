"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SurfaceVisual } from "@/components/SurfaceVisual";
import { useVoiceCommands, useVoiceHandler } from "@/contexts/VoiceContext";
import { useSurfaceSonification } from "@/lib/audio/useSurfaceSonification";
import { formatNumber } from "@/lib/math/analyze";
import {
  analyzeSurface,
  DEFAULT_TURNS,
  MAX_DOMAIN,
  MAX_TURNS,
  MIN_DOMAIN,
  MIN_TURNS,
  SURFACE_PRESETS,
} from "@/lib/math/surface";
import { clampSpeed, MAX_SPEED, MIN_SPEED } from "@/lib/voice/parseCommand";

const SCAN_SECONDS = 18;

export function SurfaceExplorer() {
  const searchParams = useSearchParams();
  const { announce } = useVoiceCommands();
  const { scan, stop, frame, error: audioError, isScanning } = useSurfaceSonification();

  const [expression, setExpression] = useState(SURFACE_PRESETS[0].expression);
  const [domain, setDomain] = useState(SURFACE_PRESETS[0].domain);
  const [turns, setTurns] = useState(DEFAULT_TURNS);
  const [expressionDraft, setExpressionDraft] = useState(SURFACE_PRESETS[0].expression);
  const [domainDraft, setDomainDraft] = useState(String(SURFACE_PRESETS[0].domain));
  const [turnsDraft, setTurnsDraft] = useState(String(DEFAULT_TURNS));
  const [formError, setFormError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [speedDraft, setSpeedDraft] = useState("1");

  const analysis = useMemo(
    () => analyzeSurface(expression, domain, turns),
    [domain, expression, turns],
  );
  const cursor = frame?.point ?? analysis.points[0] ?? null;
  const turnNumber = cursor ? cursor.angle / (2 * Math.PI) : 0;
  const frameIndexRef = useRef(0);
  frameIndexRef.current = frame?.index ?? 0;

  const applyDraft = useCallback(
    (nextExpression: string, nextDomain: number, nextTurns: number) => {
      const candidate = analyzeSurface(nextExpression, nextDomain, nextTurns, 64);
      if (candidate.error) {
        setFormError(candidate.error);
        announce(candidate.error);
        return false;
      }
      stop();
      setFormError(null);
      setExpression(nextExpression);
      setDomain(candidate.domain);
      setTurns(candidate.turns);
      setExpressionDraft(nextExpression);
      setDomainDraft(String(candidate.domain));
      setTurnsDraft(String(candidate.turns));
      announce(`Plotting z equals ${nextExpression} on x and y from minus ${candidate.domain} to ${candidate.domain}.`);
      return true;
    },
    [announce, stop],
  );

  const applySpeed = useCallback(
    (value: number, announceChange = true) => {
      const next = clampSpeed(value);
      setSpeed(next);
      setSpeedDraft(String(next));
      if (announceChange) announce(`Scan speed ${next} times.`);
    },
    [announce],
  );

  const startScan = useCallback(async () => {
    if (analysis.error || analysis.points.length < 2) return;
    announce(`Scanning the surface along an Archimedean spiral. ${analysis.turns} turns.`);
    await scan(analysis, (SCAN_SECONDS * 1000) / speed, frameIndexRef.current);
  }, [analysis, announce, scan, speed]);

  const stopScan = useCallback(() => {
    stop();
    announce("Surface scan stopped.");
  }, [announce, stop]);

  const requested = searchParams.get("f");
  useEffect(() => {
    if (!requested) return;
    applyDraft(requested, domain, turns);
    // Intentionally keyed on the query value only: re-running on every render
    // would reset the surface continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  useEffect(() => {
    const onEquation = (event: Event) => {
      const equation = (event as CustomEvent<string>).detail;
      if (typeof equation === "string" && equation.trim()) applyDraft(equation, domain, turns);
    };
    const onSpeed = (event: Event) => {
      const value = Number((event as CustomEvent<number>).detail);
      if (Number.isFinite(value)) applySpeed(value);
    };
    window.addEventListener("ondas-set-equation", onEquation);
    window.addEventListener("ondas-set-speed", onSpeed);
    return () => {
      window.removeEventListener("ondas-set-equation", onEquation);
      window.removeEventListener("ondas-set-speed", onSpeed);
    };
  }, [applyDraft, applySpeed, domain, turns]);

  useVoiceHandler((command) => {
    switch (command.type) {
      case "setMultiFunction":
        applyDraft(command.expression, domain, turns);
        return true;
      case "setDomain": {
        const half = Math.max(Math.abs(command.min), Math.abs(command.max), MIN_DOMAIN);
        applyDraft(expression, half, turns);
        return true;
      }
      case "setSpeed":
        applySpeed(command.value);
        return true;
      case "autoPlay":
        if (isScanning) stopScan();
        else void startScan();
        return true;
      case "audio":
        if (command.action === "stop") stopScan();
        else void startScan();
        return true;
      case "describe": {
        if (!cursor) {
          announce("No sample on the spiral.");
          return true;
        }
        const height = Number.isFinite(cursor.z) ? `height ${formatNumber(cursor.z)}` : "undefined";
        announce(
          `x ${formatNumber(cursor.x)}, y ${formatNumber(cursor.y)}, ${height}, turn ${formatNumber(turnNumber, 1)} of ${turns}.`,
        );
        return true;
      }
      case "help":
        announce(
          "Say set the surface to sine x times cosine y, auto play, set speed to two x, or set the domain from minus five to five. Headphones recommended for the spatial scan.",
        );
        return true;
      default:
        return false;
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

      const isControl =
        target && (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "SELECT");
      if (event.key === " " && isControl) return;

      if (event.key === "Escape") {
        event.preventDefault();
        stopScan();
        return;
      }
      if (event.key === "d") {
        event.preventDefault();
        if (!cursor) return;
        const height = Number.isFinite(cursor.z) ? `height ${formatNumber(cursor.z)}` : "undefined";
        announce(
          `x ${formatNumber(cursor.x)}, y ${formatNumber(cursor.y)}, ${height}, turn ${formatNumber(turnNumber, 1)} of ${turns}.`,
        );
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (isScanning) stopScan();
        else void startScan();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [announce, cursor, isScanning, startScan, stopScan, turnNumber, turns]);

  const readout = cursor
    ? `x ${formatNumber(cursor.x)}, y ${formatNumber(cursor.y)}, z ${formatNumber(cursor.z)}, turn ${formatNumber(turnNumber, 1)} of ${turns}`
    : "No sample on the spiral.";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Surface Waves</h1>
        <p className="mt-3 text-zinc-400">
          Type any function of two variables. The scan follows an Archimedean spiral from the origin
          outward so the ear is not flooded with a raster of rows. Left and right become{" "}
          <span className="text-zinc-200">x</span>, front and back become{" "}
          <span className="text-zinc-200">y</span>, and the height of the surface becomes pitch.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby="audio-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 id="audio-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Spatial scan
            </h2>
            <button
              type="button"
              onClick={() => (isScanning ? stopScan() : void startScan())}
              className="mt-3 w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
            >
              {isScanning ? "Stop spiral scan" : "Play spiral scan"}
              <kbd className="ml-2 rounded border border-emerald-700/40 px-1.5 py-0.5 text-[10px]">
                Space
              </kbd>
            </button>
            {audioError ? (
              <p role="alert" className="mt-2 text-sm text-rose-400">
                {audioError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                Uses a 3D HRTF panner. Headphones are required for the depth axis. Esc stops the scan.
              </p>
            )}
          </section>

          <section
            aria-labelledby="speed-heading"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="speed-heading"
                className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
              >
                Scan speed
              </h2>
              <span aria-hidden="true" className="font-mono text-sm text-fuchsia-300">
                {speed.toFixed(1)}×
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                id="surface-speed"
                type="range"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={0.1}
                value={speed}
                onChange={(event) => applySpeed(Number(event.target.value), false)}
                aria-label="Surface scan speed multiplier"
                aria-valuetext={`${speed.toFixed(1)} times normal speed`}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-fuchsia-400"
              />
              <input
                type="number"
                min={MIN_SPEED}
                max={MAX_SPEED}
                step={0.1}
                value={speedDraft}
                onChange={(event) => {
                  setSpeedDraft(event.target.value);
                  const parsed = Number(event.target.value);
                  if (event.target.value !== "" && Number.isFinite(parsed)) {
                    setSpeed(clampSpeed(parsed));
                  }
                }}
                onBlur={() => applySpeed(Number(speedDraft) || 1, false)}
                aria-label="Surface scan speed multiplier, numeric entry between 0.2 and 5"
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-right font-mono text-sm text-zinc-200 focus:border-fuchsia-400"
              />
            </div>
          </section>

          <section aria-labelledby="surface-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 id="surface-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Surface and domain
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                applyDraft(expressionDraft.trim(), Number(domainDraft), Number(turnsDraft));
              }}
              className="mt-3 space-y-4"
            >
              <div>
                <label htmlFor="surface-expression" className="block text-sm font-medium text-zinc-300">
                  z = f(x, y)
                </label>
                <input
                  id="surface-expression"
                  name="expression"
                  value={expressionDraft}
                  onChange={(event) => setExpressionDraft(event.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-describedby="surface-expression-hint"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-cyan-300 placeholder:text-zinc-600 focus:border-cyan-400"
                  placeholder="sin(x) * cos(y)"
                />
                <p id="surface-expression-hint" className="mt-1 text-xs text-zinc-500">
                  Anything mathjs understands in x and y:{" "}
                  <span className="font-mono">x^2 + y^2</span>,{" "}
                  <span className="font-mono">sin(x)*cos(y)</span>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="surface-domain" className="block text-sm font-medium text-zinc-300">
                    Domain ±
                  </label>
                  <input
                    id="surface-domain"
                    type="number"
                    min={MIN_DOMAIN}
                    max={MAX_DOMAIN}
                    step="any"
                    value={domainDraft}
                    onChange={(event) => setDomainDraft(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-200 focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label htmlFor="surface-turns" className="block text-sm font-medium text-zinc-300">
                    Spiral turns
                  </label>
                  <input
                    id="surface-turns"
                    type="number"
                    min={MIN_TURNS}
                    max={MAX_TURNS}
                    step={1}
                    value={turnsDraft}
                    onChange={(event) => setTurnsDraft(event.target.value)}
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
                Plot surface
              </button>
            </form>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">Presets</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {SURFACE_PRESETS.map((preset) => (
                <li key={preset.label}>
                  <button
                    type="button"
                    onClick={() => applyDraft(preset.expression, preset.domain, DEFAULT_TURNS)}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-cyan-500 hover:text-cyan-300"
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section
            tabIndex={0}
            role="application"
            aria-roledescription="Interactive sonified surface"
            aria-label={`Surface z equals ${expression} on a square domain of plus or minus ${domain}`}
            aria-describedby="surface-instructions surface-readout"
            className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
          >
            <p id="surface-instructions" className="sr-only">
              Press space to scan the surface along an Archimedean spiral. Pitch is height, left and
              right is x, and front and back is y. Press D after enabling voice, or use the readout
              below, to hear the current sample.
            </p>
            <div className="h-[26rem] w-full">
              <SurfaceVisual analysis={analysis} cursor={cursor} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-sm">
              <p id="surface-readout" className="font-mono text-zinc-200">
                <span className="text-zinc-500">cursor </span>
                {readout}
              </p>
              {isScanning ? (
                <p className="font-mono text-xs text-emerald-400">scanning</p>
              ) : (
                <p className="font-mono text-xs text-zinc-500">
                  {analysis.features.length} audible features
                </p>
              )}
            </div>
          </section>

          <section
            aria-labelledby="mapping-heading"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
          >
            <h2 id="mapping-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              What you are hearing
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li>
                <span className="font-medium text-cyan-300">Pitch</span> is z = f(x, y), the height of
                the surface.
              </li>
              <li>
                <span className="font-medium text-fuchsia-300">Left / right</span> is x, through the
                3D panner.
              </li>
              <li>
                <span className="font-medium text-emerald-300">Front / back</span> is y, around your
                head.
              </li>
              <li>
                A bell marks a peak along the spiral, a thud marks a valley, and a glitch marks a
                hole where the surface is undefined.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
