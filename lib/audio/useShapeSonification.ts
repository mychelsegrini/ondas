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

/**
 * Drives the automatic spatial scan of a 3D shape: an oscillator travelling
 * along the shape's path through a 3D panner, so height becomes pitch and the
 * position in space becomes genuine binaural placement.
 */
export function useShapeSonification() {
  const graphRef = useRef<ShapeGraph | null>(null);
  const frameRef = useRef<number | null>(null);
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureGraph = useCallback(async (): Promise<ShapeGraph | null> => {
    if (graphRef.current) return graphRef.current;
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

      graphRef.current = { Tone, osc, gain, panner, click };
      setError(null);
      return graphRef.current;
    } catch (err) {
      setError((err as Error).message ?? "The audio engine could not be started.");
      return null;
    }
  }, []);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const graph = graphRef.current;
    if (graph) graph.gain.gain.rampTo(0, 0.1);
    setActiveShapeId(null);
  }, []);

  const scan = useCallback(
    async (shape: Shape3D) => {
      const graph = await ensureGraph();
      if (!graph) return;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      const path = shape.buildPath(PATH_SAMPLES);
      const corners = cornerIndices(path);
      const yValues = path.map((p) => p.y);
      const yMin = Math.min(...yValues);
      const yMax = Math.max(...yValues);

      setActiveShapeId(shape.id);
      graph.gain.gain.rampTo(0.22, 0.12);

      const durationMs = shape.scanSeconds * 1000;
      const startedAt = performance.now();
      let lastIndex = -1;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const index = Math.min(path.length - 1, Math.floor(progress * (path.length - 1)));
        const point = path[index];

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
          frameRef.current = null;
          graph.gain.gain.rampTo(0, 0.35);
          setActiveShapeId(null);
          return;
        }
        frameRef.current = requestAnimationFrame(tick);
      };

      frameRef.current = requestAnimationFrame(tick);
    },
    [ensureGraph],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      const graph = graphRef.current;
      graphRef.current = null;
      if (!graph) return;
      [graph.osc, graph.gain, graph.panner, graph.click].forEach((node) => {
        try {
          node.dispose();
        } catch {
          /* already torn down */
        }
      });
    };
  }, []);

  return { scan, stop, activeShapeId, frame, error, isScanning: activeShapeId !== null };
}
