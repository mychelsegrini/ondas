"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RandomPointVisual } from "@/components/RandomPointVisual";
import { ShapeVisual } from "@/components/ShapeVisual";
import { useVoiceCommands, useVoiceHandler } from "@/contexts/VoiceContext";
import { useShapeSonification } from "@/lib/audio/useShapeSonification";
import {
  SHAPES,
  describeDirection,
  getShape,
  randomSpatialPoint,
  type Shape3D,
  type Vec3,
} from "@/lib/shapes";

const PREVIEW_SAMPLES = 420;

export function ShapesExplorer() {
  const searchParams = useSearchParams();
  const { announce } = useVoiceCommands();
  const { scan, pingAt, stop, activeShapeId, frame, error } = useShapeSonification();
  const [selectedId, setSelectedId] = useState<string>(SHAPES[0].id);
  const [randomPoint, setRandomPoint] = useState<Vec3 | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const previews = useMemo(
    () =>
      new Map(
        SHAPES.filter((shape) => shape.kind === "scan").map((shape) => [
          shape.id,
          shape.buildPath(PREVIEW_SAMPLES),
        ]),
      ),
    [],
  );

  const selected = getShape(selectedId) ?? SHAPES[0];

  const startScan = useCallback(
    (shape: Shape3D) => {
      setSelectedId(shape.id);
      if (shape.kind === "randomPoint") {
        // A fresh coordinate on every activation: the exercise is to locate a
        // direction you have not heard before.
        const point = randomSpatialPoint();
        setRandomPoint(point);
        void pingAt(point);
        announce(`Random point. ${describeDirection(point)}.`);
        return;
      }
      announce(`Scanning the ${shape.name}. ${shape.listenFor}`);
      void scan(shape);
    },
    [announce, pingAt, scan],
  );

  // Deep link and voice navigation land here: /3d-shapes?shape=cylinder
  const requestedShape = searchParams.get("shape");
  useEffect(() => {
    if (!requestedShape) return;
    const shape = getShape(requestedShape);
    if (!shape) return;
    setSelectedId(shape.id);
    buttonRefs.current[shape.id]?.focus();
    startScan(shape);
    // Intentionally keyed on the query value only: re-running on every render
    // would restart the scan continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedShape]);

  useVoiceHandler((command) => {
    if (command.type === "selectShape") {
      const shape = getShape(command.shapeId);
      if (!shape) return false;
      buttonRefs.current[shape.id]?.focus();
      startScan(shape);
      return true;
    }
    if (command.type === "audio" && command.action === "stop") {
      stop();
      announce("Scan stopped.");
      return true;
    }
    if (command.type === "describe") {
      announce(`${selected.name}. ${selected.description} ${selected.listenFor}`);
      return true;
    }
    if (command.type === "help") {
      announce(
        "Say select the sphere, scan the cylinder, or play the triangular prism. Say random point for a single localised ping, stop to end the scan, or where am I to hear the current shape.",
      );
      return true;
    }
    return false;
  });

  // Digits pick a shape without a mouse: 1 to 9, then 0 for the tenth.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        stop();
        announce("Scan stopped.");
        return;
      }
      if (!/^[0-9]$/.test(event.key)) return;
      const index = event.key === "0" ? 9 : Number(event.key) - 1;
      const shape = SHAPES[index];
      if (!shape) return;
      event.preventDefault();
      buttonRefs.current[shape.id]?.focus();
      startScan(shape);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [announce, startScan, stop]);

  const progress = frame?.progress ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Spatial Waves</h1>
        <p className="mt-3 text-zinc-400">
          Solids with an automatic spatial scan. A tone travels along the surface while a 3D panner
          places it around your head: height becomes pitch, depth becomes distance, and every sharp
          turn is an edge. Start with the random point to calibrate your ears, then move on to the
          solids. Headphones strongly recommended.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          Press a number key from <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">1</kbd> to{" "}
          <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{SHAPES.length}</kbd> to scan a
          shape, or <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">Esc</kbd> to stop.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="library-heading">
          <h2 id="library-heading" className="sr-only">
            Shape library
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SHAPES.map((shape, index) => {
              const isActive = activeShapeId === shape.id;
              const isSelected = selectedId === shape.id;
              return (
                <li key={shape.id}>
                  <button
                    type="button"
                    ref={(node) => {
                      buttonRefs.current[shape.id] = node;
                    }}
                    onClick={() => startScan(shape)}
                    aria-describedby={`${shape.id}-tagline`}
                    className={`group relative flex h-full w-full flex-col gap-3 rounded-xl border p-4 pb-6 text-left transition-colors ${
                      isActive
                        ? "border-fuchsia-500 bg-fuchsia-500/5"
                        : isSelected
                          ? "border-cyan-500/60 bg-zinc-900/60"
                          : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold text-zinc-100">{shape.name}</span>
                      <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {index === 9 ? 0 : index + 1}
                      </kbd>
                    </span>
                    {shape.kind === "randomPoint" ? (
                      <RandomPointVisual
                        point={randomPoint}
                        className="h-36 w-full text-zinc-600"
                      />
                    ) : (
                      <ShapeVisual
                        path={previews.get(shape.id)!}
                        progress={isActive ? progress : null}
                        className={`h-36 w-full ${isActive ? "text-fuchsia-300" : "text-cyan-400"}`}
                      />
                    )}
                    <span id={`${shape.id}-tagline`} className="mt-auto text-xs leading-relaxed text-zinc-500">
                      {shape.tagline}
                    </span>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-4 bottom-2 h-0.5 overflow-hidden rounded-full bg-zinc-800"
                      >
                        <span
                          className="block h-full bg-fuchsia-400 transition-[width] duration-75"
                          style={{ width: `${progress * 100}%` }}
                        />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-labelledby="detail-heading" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 id="detail-heading" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Now exploring
            </h2>
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <p className="mt-2 text-2xl font-semibold text-cyan-300">{selected.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{selected.description}</p>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Listen for
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-300/90">{selected.listenFor}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => startScan(selected)}
                className="flex-1 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-cyan-300"
              >
                {selected.kind === "randomPoint"
                  ? "Play a new random point"
                  : activeShapeId === selected.id
                    ? "Restart scan"
                    : "Play scan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stop();
                  announce("Scan stopped.");
                }}
                disabled={!activeShapeId}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop
              </button>
            </div>

            {selected.kind === "randomPoint" ? (
              <p className="mt-4 text-xs text-zinc-600">
                {randomPoint
                  ? `Last ping: ${describeDirection(randomPoint).toLowerCase()}.`
                  : "No point has been played yet."}
              </p>
            ) : (
              <p className="mt-4 text-xs text-zinc-600">
                The scan lasts about {selected.scanSeconds} seconds.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
