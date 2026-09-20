"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_FREQUENCY, MIN_FREQUENCY, normalize } from "@/lib/audio/mappings";
import type { Shape2D, Vec2 } from "@/lib/shapes2d";

type ToneModule = typeof import("tone");

const PATH_SAMPLES = 900;
/** Turn angle, in radians, above which a vertex click is fired. */
const CORNER_THRESHOLD = 0.25;

interface PolygonGraph {
  Tone: ToneModule;
  fundamental: InstanceType<ToneModule["Oscillator"]>;
  harmonic: InstanceType<ToneModule["Oscillator"]>;
  fundamentalGain: InstanceType<ToneModule["Gain"]>;
  harmonicGain: InstanceType<ToneModule["Gain"]>;
  panner: InstanceType<ToneModule["Panner"]>;
  master: InstanceType<ToneModule["Gain"]>;
  corner: InstanceType<ToneModule["MetalSynth"]>;
}

export interface PolygonFrame {
  progress: number;
  point: Vec2;
  /** Index of the corner most recently passed, or null before the first one. */
  cornersPassed: number;
}

function cornerIndices(path: Vec2[]): Set<number> {
  const corners = new Set<number>();
  for (let i = 2; i < path.length; i += 1) {
    const a = path[i - 2];
    const b = path[i - 1];
    const c = path[i];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const cos = (ux * vx + uy * vy) / (lu * lv);
    if (Math.acos(Math.min(1, Math.max(-1, cos))) > CORNER_THRESHOLD) corners.add(i);
  }
  return corners;
}

/** Silences and releases every node in a graph. Safe to call more than once. */
function disposeGraph(graph: PolygonGraph) {
  [graph.fundamental, graph.harmonic].forEach((osc) => {
    try {
      osc.stop();
    } catch {
      /* never started, or already stopped */
    }
  });
  [
    graph.fundamental,
    graph.harmonic,
    graph.fundamentalGain,
    graph.harmonicGain,
    graph.panner,
    graph.master,
    graph.corner,
  ].forEach((node) => {
    try {
      node.dispose();
    } catch {
      /* already torn down */
    }
  });
}

/**
 * Traces the perimeter of a 2D polygon: horizontal position becomes stereo
 * balance, height becomes pitch, and height also opens up a third harmonic so
 * the top of a shape is not only higher but audibly brighter. Corners fire a
 * metallic click, which is what lets a listener count the sides.
 */
export function usePolygonSonification() {
  const graphRef = useRef<PolygonGraph | null>(null);
  /** In-flight graph construction, shared by every caller that arrives during it. */
  const pendingGraphRef = useRef<Promise<PolygonGraph | null> | null>(null);
  const disposedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  /**
   * Incremented by every scan and every stop. A tick loop whose token is stale
   * has been superseded and must not touch the audio graph again.
   */
  const runIdRef = useRef(0);

  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [frame, setFrame] = useState<PolygonFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureGraph = useCallback((): Promise<PolygonGraph | null> => {
    if (graphRef.current) return Promise.resolve(graphRef.current);
    // Without this, two quick clicks each build a full graph while the first
    // import is still in flight. The loser is overwritten but its oscillators
    // keep playing with nothing left holding a reference to stop them.
    if (pendingGraphRef.current) return pendingGraphRef.current;

    const pending = (async (): Promise<PolygonGraph | null> => {
      try {
        const Tone = await import("tone");
        await Tone.start();

        const master = new Tone.Gain(0).toDestination();
        const panner = new Tone.Panner(0).connect(master);
        const fundamentalGain = new Tone.Gain(1).connect(panner);
        const harmonicGain = new Tone.Gain(0).connect(panner);
        const fundamental = new Tone.Oscillator({ frequency: 300, type: "sine" })
          .connect(fundamentalGain)
          .start();
        const harmonic = new Tone.Oscillator({ frequency: 900, type: "sine" })
          .connect(harmonicGain)
          .start();
        const corner = new Tone.MetalSynth({
          envelope: { attack: 0.001, decay: 0.08, release: 0.02 },
          harmonicity: 4.1,
          modulationIndex: 18,
          resonance: 3000,
          octaves: 1.2,
          volume: -28,
        }).toDestination();

        const graph: PolygonGraph = {
          Tone,
          fundamental,
          harmonic,
          fundamentalGain,
          harmonicGain,
          panner,
          master,
          corner,
        };

        // The component can unmount while the audio context is still starting.
        if (disposedRef.current) {
          disposeGraph(graph);
          return null;
        }

        graphRef.current = graph;
        setError(null);
        return graph;
      } catch (err) {
        setError((err as Error).message ?? "The audio engine could not be started.");
        return null;
      } finally {
        pendingGraphRef.current = null;
      }
    })();

    pendingGraphRef.current = pending;
    return pending;
  }, []);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    // Invalidate any trace that is mid-flight or mid-loop.
    runIdRef.current += 1;
    cancelFrame();
    const graph = graphRef.current;
    if (graph) graph.master.gain.rampTo(0, 0.1);
    setActiveShapeId(null);
  }, [cancelFrame]);

  const scan = useCallback(
    async (shape: Shape2D, loop = false) => {
      const path = shape.buildPath(PATH_SAMPLES);
      if (path.length < 2) return;

      // Claim this run before awaiting, so a later click always wins the race.
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      const graph = await ensureGraph();
      if (!graph || disposedRef.current || runIdRef.current !== runId) return;

      cancelFrame();

      const corners = cornerIndices(path);
      const ys = path.map((p) => p.y);
      const xs = path.map((p) => p.x);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);

      setActiveShapeId(shape.id);
      graph.master.gain.rampTo(0.2, 0.12);

      const durationMs = Math.max(1, shape.scanSeconds * 1000);
      let startedAt = performance.now();
      let lastIndex = -1;
      let cornersPassed = 0;

      const finish = () => {
        frameRef.current = null;
        graph.master.gain.rampTo(0, 0.3);
        setActiveShapeId(null);
      };

      const tick = (now: number) => {
        // A newer trace, or stop(), has taken over since this frame was queued.
        if (runIdRef.current !== runId || disposedRef.current) return;

        let progress = (now - startedAt) / durationMs;
        if (progress >= 1 && loop) {
          startedAt = now;
          progress = 0;
          lastIndex = -1;
          cornersPassed = 0;
        }
        // Clamped at both ends: rAF timestamps are not guaranteed to be later
        // than the performance.now() taken when the trace was started, and a
        // negative progress would index the path out of bounds.
        progress = Math.max(0, Math.min(1, progress));

        const index = Math.max(
          0,
          Math.min(path.length - 1, Math.floor(progress * (path.length - 1))),
        );
        const point = path[index];
        if (!point) {
          finish();
          return;
        }

        const height = normalize(point.y, yMin, yMax);
        const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, height);
        graph.fundamental.frequency.rampTo(frequency, 0.03);
        graph.harmonic.frequency.rampTo(frequency * 3, 0.03);
        // Height also brightens the timbre, so the top of a shape is unmistakable.
        graph.harmonicGain.gain.rampTo(0.06 + height * 0.3, 0.05);
        graph.panner.pan.rampTo(normalize(point.x, xMin, xMax) * 2 - 1, 0.03);

        for (let i = lastIndex + 1; i <= index; i += 1) {
          if (corners.has(i)) {
            graph.corner.triggerAttackRelease("C6", 0.05, graph.Tone.now());
            cornersPassed += 1;
            break;
          }
        }
        lastIndex = index;
        setFrame({ progress, point, cornersPassed });

        if (progress >= 1 && !loop) {
          finish();
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    },
    [cancelFrame, ensureGraph],
  );

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      runIdRef.current += 1;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) disposeGraph(graph);
    };
  }, []);

  return { scan, stop, activeShapeId, frame, error, isScanning: activeShapeId !== null };
}
