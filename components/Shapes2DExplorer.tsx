"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Shape2DVisual } from "@/components/Shape2DVisual";
import { useVoiceCommands, useVoiceHandler } from "@/contexts/VoiceContext";
import { usePolygonSonification } from "@/lib/audio/usePolygonSonification";
import { SHAPES_2D, getShape2D, type Shape2D } from "@/lib/shapes2d";

const PREVIEW_SAMPLES = 360;

export function Shapes2DExplorer() {
  const searchParams = useSearchParams();
  const { announce } = useVoiceCommands();
  const { scan, stop, activeShapeId, frame, error } = usePolygonSonification();
  const [selectedId, setSelectedId] = useState<string>(SHAPES_2D[0].id);
  const [loop, setLoop] = useState(false);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const previews = useMemo(
    () => new Map(SHAPES_2D.map((shape) => [shape.id, shape.buildPath(PREVIEW_SAMPLES)])),
    [],
  );

  const selected = getShape2D(selectedId) ?? SHAPES_2D[0];
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const startScan = useCallback(
    (shape: Shape2D) => {
      setSelectedId(shape.id);
      announce(`Tracing the ${shape.name}. ${shape.listenFor}`);
      void scan(shape, loopRef.current);
    },
    [announce, scan],
  );

  // Deep link and voice navigation land here: /2d-shapes?shape=hexagon
  const requestedShape = searchParams.get("shape");
  useEffect(() => {
    if (!requestedShape) return;
    const shape = getShape2D(requestedShape);
    if (!shape) return;
    setSelectedId(shape.id);
    buttonRefs.current[shape.id]?.focus();
    startScan(shape);
    // Keyed on the query value only, so the scan is not restarted every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedShape]);

  useEffect(() => {
    const onShape = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const shape = typeof id === "string" ? getShape2D(id) : undefined;
      if (!shape) return;
      buttonRefs.current[shape.id]?.focus();
      startScan(shape);
    };
    window.addEventListener("ondas-select-shape", onShape);
    return () => window.removeEventListener("ondas-select-shape", onShape);
  }, [startScan]);

  useVoiceHandler((command) => {
    if (command.type === "selectShape") {
      const shape = getShape2D(command.shapeId);
      if (!shape) return false;
      buttonRefs.current[shape.id]?.focus();
      startScan(shape);
      return true;
    }
    if (command.type === "audio" && command.action === "stop") {
      stop();
      announce("Trace stopped.");
      return true;
    }
    if (command.type === "describe") {
      announce(`${selected.name}. ${selected.description} ${selected.listenFor}`);
      return true;
    }
    if (command.type === "help") {
      announce(
        "Say trace the square, select the hexagon, or play the circle. Say stop to end the trace, or where am I to hear the current shape.",
      );
      return true;
    }
    return false;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        stop();
        announce("Trace stopped.");
        return;
      }
      if (!/^[1-9]$/.test(event.key)) return;
      const shape = SHAPES_2D[Number(event.key) - 1];
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
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Flat Waves</h1>
        <p className="mt-3 text-zinc-400">
          Six plane figures, each traced around its perimeter by a moving tone. Horizontal position
          becomes stereo balance, height becomes pitch and brightness, and every corner fires a
          short metallic click. Count the clicks and you have counted the sides.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          Press a number key from <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">1</kbd>{" "}
          to <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{SHAPES_2D.length}</kbd> to
          trace a shape, or <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">Esc</kbd> to
          stop.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-rose-900 bg-rose-950/40 p-4 text-rose-300"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="library-heading">
          <h2 id="library-heading" className="sr-only">
            Polygon library
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SHAPES_2D.map((shape, index) => {
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
                          ? "border-emerald-500/60 bg-zinc-900/60"
                          : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-600 hover:bg-zinc-900/60"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-base font-semibold text-zinc-100">{shape.name}</span>
                      <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {index + 1}
                      </kbd>
                    </span>
                    <Shape2DVisual
                      path={previews.get(shape.id)!}
                      progress={isActive ? progress : null}
                      className={`h-36 w-full ${isActive ? "text-fuchsia-300" : "text-emerald-400"}`}
                    />
                    <span
                      id={`${shape.id}-tagline`}
                      className="mt-auto text-xs leading-relaxed text-zinc-500"
                    >
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
            <h2
              id="detail-heading"
              className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
            >
              Now tracing
            </h2>
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <p className="mt-2 text-2xl font-semibold text-emerald-300">{selected.name}</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{selected.description}</p>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Listen for
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-cyan-300/90">
                  {selected.listenFor}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => startScan(selected)}
                className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300"
              >
                {activeShapeId === selected.id ? "Restart trace" : "Play trace"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stop();
                  announce("Trace stopped.");
                }}
                disabled={!activeShapeId}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Stop
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 accent-emerald-400"
              />
              Loop the trace until stopped
            </label>

            <dl className="mt-5 space-y-1 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
              <div className="flex justify-between gap-4">
                <dt>Corners</dt>
                <dd className="font-mono text-zinc-300">
                  {selected.corners === 0 ? "none" : selected.corners}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Lap duration</dt>
                <dd className="font-mono text-zinc-300">{selected.scanSeconds}s</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Corners heard</dt>
                <dd className="font-mono text-zinc-300">
                  {activeShapeId === selected.id ? (frame?.cornersPassed ?? 0) : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
