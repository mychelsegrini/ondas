/**
 * Perceptual mappings shared by every sonification surface in Ondas.
 * Keeping them in one place means the 2D explorer and the 3D library
 * "speak the same language" to the listener.
 */

export const MIN_FREQUENCY = 150;
export const MAX_FREQUENCY = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max - min === 0) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Height becomes pitch. The mapping is exponential because pitch perception is
 * logarithmic: equal steps on the graph then sound like equal musical steps.
 */
export function yToFrequency(y: number, yMin: number, yMax: number): number {
  const t = normalize(y, yMin, yMax);
  return MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, t);
}

/** Horizontal position becomes stereo placement, hard left to hard right. */
export function xToPan(x: number, xMin: number, xMax: number): number {
  return normalize(x, xMin, xMax) * 2 - 1;
}

export interface TimbreMapping {
  /** 0 = pure sine (rising), 1 = full sawtooth (falling). */
  sawMix: number;
  /** Lowpass cutoff in Hz: gentle slopes sound muffled, steep slopes sound bright. */
  cutoff: number;
}

/**
 * The first derivative drives the timbre. Going uphill stays a clean sine; going
 * downhill blends in a sawtooth so direction is audible without looking.
 */
export function slopeToTimbre(dy: number): TimbreMapping {
  const slope = Number.isFinite(dy) ? dy : 0;
  const steepness = Math.min(1, Math.abs(slope) / 4);
  const sawMix = slope < 0 ? 0.15 + 0.75 * steepness : 0;
  const cutoff = 400 + steepness * 6000;
  return { sawMix, cutoff };
}
