"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_FREQUENCY, MIN_FREQUENCY, normalize } from "@/lib/audio/mappings";
import type { Shape3D, Vec3 } from "@/lib/shapes";

type ToneModule = typeof import("tone");

const PATH_SAMPLES = 900;
/** Angle between consecutive segments above which we call it an edge/vertex. */
const CORNER_THRESHOLD = 0.35;

interface ShapeGraph {
  Tone: ToneModule;
  osc: InstanceType<ToneModule["Oscillator"]>;
  gain: InstanceType<ToneModule["Gain"]>;
  panner: InstanceType<ToneModule["Panner3D"]>;
  click: InstanceType<ToneModule["Synth"]>;
  ping: InstanceType<ToneModule["Synth"]>;
}

export interface ScanFrame {
  progress: number;
  point: Vec3;
}

function cornerIndices(path: Vec3[]): Set<number> {
  const corners = new Set<number>();
  for (let i = 2; i < path.length; i += 1) {
    const a = path[i - 2];
    const b = path[i - 1];
    const c = path[i];
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const lu = Math.hypot(u.x, u.y, u.z);
    const lv = Math.hypot(v.x, v.y, v.z);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (lu * lv);
    if (Math.acos(Math.min(1, Math.max(-1, cos))) > CORNER_THRESHOLD) {
      corners.add(i);
    }
  }
  return corners;
}

/** Silences and releases every node in a graph. Safe to call more than once. */
function disposeGraph(graph: ShapeGraph) {
  try {
    graph.osc.stop();
  } catch {
    /* never started, or already stopped */
  }
  [graph.osc, graph.gain, graph.panner, graph.click, graph.ping].forEach((node) => {
    try {
      node.dispose();
    } catch {
      /* already torn down */
    }
  });
}

/**
 * Drives the automatic spatial scan of a 3D shape: an oscillator travelling
 * along the shape's path through a 3D panner, so height becomes pitch and the
 * position in space becomes genuine binaural placement.
 */
export function useShapeSonification() {
  const graphRef = useRef<ShapeGraph | null>(null);
  /** In-flight graph construction, shared by every caller that arrives during it. */
  const pendingGraphRef = useRef<Promise<ShapeGraph | null> | null>(null);
  const disposedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  /**
   * Incremented by every scan and every stop. A tick loop whose token is stale
   * has been superseded and must not touch the audio graph again.
   */
  const runIdRef = useRef(0);

  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureGraph = useCallback((): Promise<ShapeGraph | null> => {
    if (graphRef.current) return Promise.resolve(graphRef.current);
    // Without this, two quick clicks each build a full graph while the first
    // import is still in flight. The loser is overwritten but its oscillator
    // keeps playing with nothing left holding a reference to stop it.
    if (pendingGraphRef.current) return pendingGraphRef.current;

    const pending = (async (): Promise<ShapeGraph | null> => {
      try {
        const Tone = await import("tone");
        await Tone.start();

        const panner = new Tone.Panner3D({
          panningModel: "HRTF",
          distanceModel: "inverse",
          refDistance: 2,
          rolloffFactor: 1.4,
          maxDistance: 20,
        }).toDestination();
        const gain = new Tone.Gain(0).connect(panner);
        const osc = new Tone.Oscillator({ frequency: 300, type: "triangle" }).connect(gain).start();
        const click = new Tone.Synth({
          oscillator: { type: "square" },
          envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
          volume: -22,
        }).toDestination();

        // The random point ping shares the 3D panner, so it is localised in
        // exactly the same way the scans are.
        const ping = new Tone.Synth({
          oscillator: { type: "triangle" },
          envelope: { attack: 0.002, decay: 0.32, sustain: 0, release: 0.12 },
          volume: -4,
        }).connect(panner);

        const graph: ShapeGraph = { Tone, osc, gain, panner, click, ping };

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
    // Invalidate any scan that is mid-flight or mid-loop.
    runIdRef.current += 1;
    cancelFrame();
    const graph = graphRef.current;
    if (graph) graph.gain.gain.rampTo(0, 0.1);
    setActiveShapeId(null);
  }, [cancelFrame]);

  /**
   * Places the 3D panner at a single point and fires one short ping from it.
   * Radius 3 keeps it clearly outside the listener's head while staying inside
   * the panner's reference distance, so direction dominates over loudness.
   */
  const pingAt = useCallback(
    async (point: Vec3) => {
      // Claim the run before awaiting, exactly as scan() does, so whichever
      // card the user pressed last is the one that ends up playing.
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      const graph = await ensureGraph();
      if (!graph || disposedRef.current || runIdRef.current !== runId) return;

      // Silence any running scan without bumping the token we just claimed.
      cancelFrame();
      graph.gain.gain.rampTo(0, 0.1);
      setActiveShapeId(null);

      const radius = 3;
      graph.panner.setPosition(point.x * radius, point.y * radius, point.z * radius);
      // Two quick notes: a single click is much harder to localise than a pair.
      const now = graph.Tone.now();
      graph.ping.triggerAttackRelease(660, 0.12, now);
      graph.ping.triggerAttackRelease(880, 0.18, now + 0.2);
    },
    [cancelFrame, ensureGraph],
  );

  const scan = useCallback(
    async (shape: Shape3D) => {
      const path = shape.buildPath(PATH_SAMPLES);
      // A pathless shape (the random point) has nothing to trace.
      if (path.length < 2) return;

      // Claim this run before awaiting, so a later click always wins the race.
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      const graph = await ensureGraph();
      if (!graph || disposedRef.current || runIdRef.current !== runId) return;

      cancelFrame();

      const corners = cornerIndices(path);
      const yValues = path.map((p) => p.y);
      const yMin = Math.min(...yValues);
      const yMax = Math.max(...yValues);

      setActiveShapeId(shape.id);
      graph.gain.gain.rampTo(0.22, 0.12);

      const durationMs = Math.max(1, shape.scanSeconds * 1000);
      const startedAt = performance.now();
      let lastIndex = -1;

      const finish = () => {
        frameRef.current = null;
        graph.gain.gain.rampTo(0, 0.35);
        setActiveShapeId(null);
      };

      const tick = (now: number) => {
        // A newer scan, or stop(), has taken over since this frame was queued.
        if (runIdRef.current !== runId || disposedRef.current) return;

        // Clamped at both ends: rAF timestamps are not guaranteed to be later
        // than the performance.now() taken when the scan was started, and a
        // negative progress would index the path out of bounds.
        const progress = Math.max(0, Math.min(1, (now - startedAt) / durationMs));
        const index = Math.max(
          0,
          Math.min(path.length - 1, Math.floor(progress * (path.length - 1))),
        );
        const point = path[index];
        if (!point) {
          finish();
          return;
        }

        const t = normalize(point.y, yMin, yMax);
        graph.osc.frequency.rampTo(MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, t), 0.03);
        // The listener sits at the origin facing negative z, so the path is
        // pushed forward and widened to make the binaural cues obvious.
        graph.panner.setPosition(point.x * 2.2, point.y * 1.5, point.z * 1.4 - 3);

        for (let i = lastIndex + 1; i <= index; i += 1) {
          if (corners.has(i)) {
            graph.click.triggerAttackRelease(880, 0.03, graph.Tone.now());
            break;
          }
        }
        lastIndex = index;
        setFrame({ progress, point });

        if (progress >= 1) {
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

  return { scan, pingAt, stop, activeShapeId, frame, error, isScanning: activeShapeId !== null };
}
