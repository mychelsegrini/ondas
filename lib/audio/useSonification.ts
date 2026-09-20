"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EarconKind } from "@/lib/audio/mappings";

type ToneModule = typeof import("tone");

export type AudioStatus = "idle" | "starting" | "ready" | "error";

export interface ToneUpdate {
  frequency: number;
  pan: number;
  sawMix: number;
  cutoff: number;
}

interface AudioGraph {
  Tone: ToneModule;
  sine: InstanceType<ToneModule["Oscillator"]>;
  saw: InstanceType<ToneModule["Oscillator"]>;
  sineGain: InstanceType<ToneModule["Gain"]>;
  sawGain: InstanceType<ToneModule["Gain"]>;
  filter: InstanceType<ToneModule["Filter"]>;
  panner: InstanceType<ToneModule["Panner"]>;
  master: InstanceType<ToneModule["Gain"]>;
  bell: InstanceType<ToneModule["PolySynth"]>;
  thud: InstanceType<ToneModule["MembraneSynth"]>;
  chord: InstanceType<ToneModule["PolySynth"]>;
  glitchNoise: InstanceType<ToneModule["NoiseSynth"]>;
  glitchBuzz: InstanceType<ToneModule["PolySynth"]>;
  glitchFilter: InstanceType<ToneModule["Filter"]>;
}

const CONTINUOUS_LEVEL = 0.18;
const RAMP_SECONDS = 0.04;

/**
 * Owns the whole Tone.js graph for the continuous "cursor tone" plus the three
 * earcons. Tone.js is imported dynamically and the nodes are only built after a
 * user gesture, which is what browsers require to unlock the AudioContext.
 */
export function useSonification() {
  const graphRef = useRef<AudioGraph | null>(null);
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [isToneOn, setIsToneOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    if (graphRef.current) return true;
    setStatus("starting");
    try {
      const Tone = await import("tone");
      await Tone.start();

      const master = new Tone.Gain(0).toDestination();
      const panner = new Tone.Panner(0).connect(master);
      const filter = new Tone.Filter({ frequency: 2000, type: "lowpass", rolloff: -12 }).connect(panner);

      const sineGain = new Tone.Gain(1).connect(filter);
      const sawGain = new Tone.Gain(0).connect(filter);
      const sine = new Tone.Oscillator({ frequency: 440, type: "sine" }).connect(sineGain).start();
      const saw = new Tone.Oscillator({ frequency: 440, type: "sawtooth" }).connect(sawGain).start();

      // Earcons sit on their own path so they overlap the continuous tone
      // instead of being swallowed by the filter and panner.
      const bell = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.5 },
        volume: -14,
      }).toDestination();

      const thud = new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.3 },
        volume: -6,
      }).toDestination();

      const chord = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.02, decay: 0.5, sustain: 0.05, release: 0.6 },
        volume: -18,
      }).toDestination();

      // Discontinuity earcon: a band limited noise burst layered with two
      // square waves a semitone apart. The beating between them is what makes
      // it read as a harsh glitch rather than as a musical note.
      const glitchFilter = new Tone.Filter({
        frequency: 1400,
        type: "bandpass",
        Q: 1.8,
      }).toDestination();
      const glitchNoise = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.04 },
        volume: -14,
      }).connect(glitchFilter);
      const glitchBuzz = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "square" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.04 },
        volume: -22,
      }).toDestination();

      graphRef.current = {
        Tone,
        sine,
        saw,
        sineGain,
        sawGain,
        filter,
        panner,
        master,
        bell,
        thud,
        chord,
        glitchNoise,
        glitchBuzz,
        glitchFilter,
      };
      setStatus("ready");
      setError(null);
      return true;
    } catch (err) {
      setStatus("error");
      setError((err as Error).message ?? "The audio engine could not be started.");
      return false;
    }
  }, []);

  const update = useCallback((params: ToneUpdate) => {
    const graph = graphRef.current;
    if (!graph) return;
    const frequency = Number.isFinite(params.frequency) ? params.frequency : 220;
    const pan = Number.isFinite(params.pan) ? Math.max(-1, Math.min(1, params.pan)) : 0;

    graph.sine.frequency.rampTo(frequency, RAMP_SECONDS);
    graph.saw.frequency.rampTo(frequency, RAMP_SECONDS);
    graph.panner.pan.rampTo(pan, RAMP_SECONDS);
    graph.filter.frequency.rampTo(Math.max(120, params.cutoff), RAMP_SECONDS);
    graph.sawGain.gain.rampTo(Math.max(0, Math.min(1, params.sawMix)), RAMP_SECONDS);
    graph.sineGain.gain.rampTo(1 - 0.4 * Math.max(0, Math.min(1, params.sawMix)), RAMP_SECONDS);
  }, []);

  const playTone = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.master.gain.rampTo(CONTINUOUS_LEVEL, 0.08);
    setIsToneOn(true);
  }, []);

  const stopTone = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.master.gain.rampTo(0, 0.12);
    setIsToneOn(false);
  }, []);

  const playEarcon = useCallback((kind: EarconKind) => {
    const graph = graphRef.current;
    if (!graph) return;
    const now = graph.Tone.now();
    if (kind === "max") {
      // Crystalline bell: a bright, slightly inharmonic stack.
      graph.bell.triggerAttackRelease([1318.51, 1975.53, 2637.02], 0.6, now, 0.8);
    } else if (kind === "min") {
      // Heavy percussive thud at the bottom of the register.
      graph.thud.triggerAttackRelease(55, 0.5, now, 0.9);
    } else if (kind === "discontinuity") {
      // Harsh glitch: noise burst plus two clashing squares.
      graph.glitchNoise.triggerAttackRelease(0.14, now, 1);
      graph.glitchBuzz.triggerAttackRelease([196, 207.65], 0.18, now, 0.9);
    } else {
      // Soft transitional chord for the change of curvature.
      graph.chord.triggerAttackRelease([523.25, 659.25, 783.99], 0.45, now, 0.5);
    }
  }, []);

  useEffect(() => {
    return () => {
      const graph = graphRef.current;
      if (!graph) return;
      graphRef.current = null;
      [
        graph.sine,
        graph.saw,
        graph.sineGain,
        graph.sawGain,
        graph.filter,
        graph.panner,
        graph.master,
        graph.bell,
        graph.thud,
        graph.chord,
        graph.glitchNoise,
        graph.glitchBuzz,
        graph.glitchFilter,
      ].forEach((node) => {
        try {
          node.dispose();
        } catch {
          /* already torn down */
        }
      });
    };
  }, []);

  return {
    status,
    error,
    isReady: status === "ready",
    isToneOn,
    start,
    update,
    playTone,
    stopTone,
    playEarcon,
  };
}
