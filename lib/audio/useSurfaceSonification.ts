"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { yToFrequency } from "@/lib/audio/mappings";
import type { SpiralPoint, SurfaceAnalysis } from "@/lib/math/surface";

type ToneModule = typeof import("tone");

const RAMP_SECONDS = 0.06;
const SCAN_LEVEL = 0.2;
const PAN_RADIUS = 2.6;
/** Places the whole spiral in front of the listener (Web Audio forward is −Z). */
const DEPTH_OFFSET = -2.8;

interface SurfaceGraph {
  Tone: ToneModule;
  osc: InstanceType<ToneModule["Oscillator"]>;
  gain: InstanceType<ToneModule["Gain"]>;
  panner: InstanceType<ToneModule["Panner3D"]>;
  peak: InstanceType<ToneModule["PolySynth"]>;
  valley: InstanceType<ToneModule["MembraneSynth"]>;
  gap: InstanceType<ToneModule["NoiseSynth"]>;
}

export interface SurfaceFrame {
  progress: number;
  index: number;
  point: SpiralPoint;
}

/** Silences and releases every node in a graph. Safe to call more than once. */
function disposeGraph(graph: SurfaceGraph) {
  try {
    graph.osc.stop();
  } catch {
    /* never started, or already stopped */
  }
  [graph.osc, graph.gain, graph.panner, graph.peak, graph.valley, graph.gap].forEach((node) => {
    try {
      node.dispose();
    } catch {
      /* already torn down */
    }
  });
}

/**
 * Sonifies z = f(x, y) by travelling an Archimedean spiral through a 3D panner.
 * x becomes left/right, y becomes front/back, and the surface height becomes pitch.
 */
export function useSurfaceSonification() {
  const graphRef = useRef<SurfaceGraph | null>(null);
  const pendingGraphRef = useRef<Promise<SurfaceGraph | null> | null>(null);
  const disposedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const lastFeatureRef = useRef<number | null>(null);

  const [frame, setFrame] = useState<SurfaceFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const ensureGraph = useCallback((): Promise<SurfaceGraph | null> => {
    if (graphRef.current) return Promise.resolve(graphRef.current);
    if (pendingGraphRef.current) return pendingGraphRef.current;

    const pending = (async (): Promise<SurfaceGraph | null> => {
      try {
        const Tone = await import("tone");
        await Tone.start();

        const panner = new Tone.Panner3D({
          panningModel: "HRTF",
          distanceModel: "inverse",
          refDistance: 2,
          rolloffFactor: 1.2,
          maxDistance: 24,
        }).toDestination();
        const gain = new Tone.Gain(0).connect(panner);
        const osc = new Tone.Oscillator({ frequency: 330, type: "sine" }).connect(gain).start();

        const peak = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sine" },
          envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.4 },
          volume: -16,
        }).toDestination();
        const valley = new Tone.MembraneSynth({
          pitchDecay: 0.08,
          octaves: 4,
          envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.25 },
          volume: -8,
        }).toDestination();
        const gap = new Tone.NoiseSynth({
          noise: { type: "white" },
          envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 },
          volume: -16,
        }).toDestination();

        const graph: SurfaceGraph = { Tone, osc, gain, panner, peak, valley, gap };
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
    runIdRef.current += 1;
    cancelFrame();
    const graph = graphRef.current;
    if (graph) graph.gain.gain.rampTo(0, 0.12);
    setIsScanning(false);
  }, [cancelFrame]);

  /**
   * Walks the precomputed spiral. Spatial position and pitch are ramped between
   * samples so the motion reads as a continuous liquid texture rather than a
   * sequence of hops.
   */
  const scan = useCallback(
    async (analysis: SurfaceAnalysis, durationMs: number, from = 0) => {
      const path = analysis.points;
      if (path.length < 2 || analysis.error) return;

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      const graph = await ensureGraph();
      if (!graph || disposedRef.current || runIdRef.current !== runId) return;

      cancelFrame();
      lastFeatureRef.current = null;
      setIsScanning(true);
      graph.gain.gain.rampTo(SCAN_LEVEL, 0.1);

      const last = path.length - 1;
      const startIndex = from >= last || from < 0 ? 0 : from;
      const span = Math.max(80, durationMs * (1 - startIndex / last));
      const startedAt = performance.now();
      const featureByIndex = new Map(analysis.features.map((feature) => [feature.index, feature]));

      const applyPoint = (point: SpiralPoint) => {
        const xPos = (point.x / analysis.domain) * PAN_RADIUS;
        const zPos = (point.y / analysis.domain) * PAN_RADIUS + DEPTH_OFFSET;
        graph.panner.positionX.rampTo(xPos, RAMP_SECONDS);
        graph.panner.positionZ.rampTo(zPos, RAMP_SECONDS);
        graph.panner.positionY.rampTo(0, RAMP_SECONDS);

        if (!Number.isFinite(point.z)) {
          graph.gain.gain.rampTo(0, RAMP_SECONDS);
          return;
        }

        graph.gain.gain.rampTo(SCAN_LEVEL, RAMP_SECONDS);
        // The oscillator frequency Signal is what actually ramps; Tone.Frequency
        // is only a unit helper, so this is the API that produces the smooth glide.
        graph.osc.frequency.rampTo(yToFrequency(point.z, analysis.zMin, analysis.zMax), RAMP_SECONDS);
      };

      const finish = () => {
        frameRef.current = null;
        graph.gain.gain.rampTo(0, 0.35);
        setIsScanning(false);
      };

      const tick = (now: number) => {
        if (runIdRef.current !== runId || disposedRef.current) return;

        const progress = Math.max(0, Math.min(1, (now - startedAt) / span));
        const index = Math.max(
          0,
          Math.min(last, Math.round(startIndex + progress * (last - startIndex))),
        );
        const point = path[index];
        if (!point) {
          finish();
          return;
        }

        applyPoint(point);

        const feature = featureByIndex.get(index);
        if (feature && lastFeatureRef.current !== feature.index) {
          lastFeatureRef.current = feature.index;
          const at = graph.Tone.now();
          if (feature.kind === "peak") {
            graph.peak.triggerAttackRelease([1318.51, 1975.53], 0.45, at, 0.7);
          } else if (feature.kind === "valley") {
            graph.valley.triggerAttackRelease(55, 0.4, at, 0.85);
          } else {
            graph.gap.triggerAttackRelease(0.12, at, 1);
          }
        }

        setFrame({ progress: startIndex / last + progress * (1 - startIndex / last), index, point });

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
      cancelFrame();
      const graph = graphRef.current;
      graphRef.current = null;
      if (graph) disposeGraph(graph);
    };
  }, [cancelFrame]);

  return { scan, stop, frame, error, isScanning };
}
