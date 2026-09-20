import { compile } from "mathjs";

/**
 * A point on the scan path. `t` is normalised time along the spiral, so it maps
 * directly onto playback progress.
 */
export interface SpiralPoint {
  t: number;
  x: number;
  y: number;
  /** f(x, y). NaN where the surface is undefined or not real. */
  z: number;
  /** Distance from the origin, i.e. how far the scan has travelled outwards. */
  radius: number;
  /** Angle in radians, unwrapped, so it grows past 2*pi on later turns. */
  angle: number;
}

export type SurfaceFeatureKind = "peak" | "valley" | "undefined";

export interface SurfaceFeature {
  kind: SurfaceFeatureKind;
  index: number;
  x: number;
  y: number;
  z: number;
}

export interface SurfaceAnalysis {
  expression: string;
  /** Half width of the square domain: x and y both run over [-domain, domain]. */
  domain: number;
  turns: number;
  points: SpiralPoint[];
  features: SurfaceFeature[];
  /** Plot and pitch window, trimmed so a single pole cannot flatten everything. */
  zMin: number;
  zMax: number;
  /** Fraction of the path where the surface is undefined, 0 to 1. */
  undefinedRatio: number;
  error: string | null;
}

export const SPIRAL_SAMPLES = 1440;
export const GRID_RESOLUTION = 80;
export const DEFAULT_DOMAIN = 5;
export const DEFAULT_TURNS = 5;

export const MIN_DOMAIN = 1;
export const MAX_DOMAIN = 20;
export const MIN_TURNS = 1;
export const MAX_TURNS = 12;

export type SurfaceFn = (x: number, y: number) => number;

function toFiniteNumber(value: unknown): number {
  // mathjs can hand back Complex, Unit or BigNumber; none of those are heights.
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

/**
 * Compiles f(x, y) once. Throws on a syntax error so the caller can show the
 * message; evaluation errors become NaN, which the scan reads as "undefined here".
 */
export function compileSurface(expression: string): SurfaceFn {
  const compiled = compile(expression);
  const scope = { x: 0, y: 0 };
  return (x: number, y: number) => {
    scope.x = x;
    scope.y = y;
    try {
      return toFiniteNumber(compiled.evaluate(scope));
    } catch {
      return Number.NaN;
    }
  };
}

/**
 * The Archimedean spiral x(t) = a*t*cos(b*t), y(t) = a*t*sin(b*t).
 *
 * `a` is set to the domain radius so t = 1 lands exactly on the inscribed
 * circle of the square domain, and `b` to 2*pi*turns so the path completes the
 * requested number of revolutions. Because b*t is linear in t, the angular rate
 * is constant: every revolution takes the same time, which gives the listener a
 * steady rhythm to count turns against while the radius grows underneath it.
 */
export function buildSpiral(
  domain: number,
  turns: number,
  samples: number,
): Array<Omit<SpiralPoint, "z">> {
  const a = domain;
  const b = 2 * Math.PI * turns;
  const path: Array<Omit<SpiralPoint, "z">> = [];

  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const angle = b * t;
    const radius = a * t;
    path.push({
      t,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      radius,
      angle,
    });
  }
  return path;
}

/**
 * Percentile-trimmed range. A surface like 1/(x*y) has values running to
 * infinity near the axes; without trimming, those few samples would compress
 * the entire audible pitch range into nothing.
 */
function robustRange(values: number[]): { min: number; max: number } {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return { min: -1, max: 1 };

  const low = finite[Math.floor(finite.length * 0.02)];
  const high = finite[Math.floor(finite.length * 0.98)];
  let min = Math.min(low, high);
  let max = Math.max(low, high);

  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-9) {
    const centre = Number.isFinite(min) ? min : 0;
    min = centre - 1;
    max = centre + 1;
  }
  return { min, max };
}

/** Local extrema of z along the path, plus the edges of undefined stretches. */
function findFeatures(points: SpiralPoint[], zMin: number, zMax: number): SurfaceFeature[] {
  const features: SurfaceFeature[] = [];
  // Compare against a neighbourhood, not just the two adjacent samples, so a
  // noisy surface does not fire on every wiggle. Prominence is measured against
  // the window edges: adjacent samples on a smooth spiral are almost equal.
  const window = 12;
  const threshold = Math.max((zMax - zMin) * 0.08, 1e-6);
  let lastFeatureIndex = -window;

  for (let i = window; i < points.length - window; i += 1) {
    const point = points[i];

    if (!Number.isFinite(point.z)) {
      if (Number.isFinite(points[i - 1].z)) {
        features.push({ kind: "undefined", index: i, x: point.x, y: point.y, z: Number.NaN });
      }
      continue;
    }

    if (i - lastFeatureIndex < window) continue;

    let isPeak = true;
    let isValley = true;
    for (let k = i - window; k <= i + window; k += 1) {
      if (k === i) continue;
      const other = points[k].z;
      if (!Number.isFinite(other)) continue;
      if (other > point.z) isPeak = false;
      if (other < point.z) isValley = false;
      if (!isPeak && !isValley) break;
    }

    if (isPeak || isValley) {
      const left = points[i - window].z;
      const right = points[i + window].z;
      const edge = isPeak
        ? Math.max(Number.isFinite(left) ? left : point.z, Number.isFinite(right) ? right : point.z)
        : Math.min(Number.isFinite(left) ? left : point.z, Number.isFinite(right) ? right : point.z);
      const prominence = isPeak ? point.z - edge : edge - point.z;
      if (prominence < threshold) continue;

      features.push({
        kind: isPeak ? "peak" : "valley",
        index: i,
        x: point.x,
        y: point.y,
        z: point.z,
      });
      lastFeatureIndex = i;
    }
  }
  return features;
}

export function analyzeSurface(
  expression: string,
  domain: number = DEFAULT_DOMAIN,
  turns: number = DEFAULT_TURNS,
  samples: number = SPIRAL_SAMPLES,
): SurfaceAnalysis {
  const safeDomain = Math.min(MAX_DOMAIN, Math.max(MIN_DOMAIN, domain));
  const safeTurns = Math.min(MAX_TURNS, Math.max(MIN_TURNS, turns));
  const empty: SurfaceAnalysis = {
    expression,
    domain: safeDomain,
    turns: safeTurns,
    points: [],
    features: [],
    zMin: -1,
    zMax: 1,
    undefinedRatio: 1,
    error: null,
  };

  if (!expression.trim()) {
    return { ...empty, error: "Enter a function of x and y." };
  }

  let surface: SurfaceFn;
  try {
    surface = compileSurface(expression);
  } catch (err) {
    return { ...empty, error: (err as Error).message ?? "That expression could not be parsed." };
  }

  // A surface with no y is legal maths but belongs on the 2D explorer, so say so
  // rather than letting the listener wonder why depth never changes the sound.
  const probe = [surface(0, 0), surface(1, 1), surface(-1, 2)];
  if (probe.every((value) => !Number.isFinite(value))) {
    return { ...empty, error: "This expression is not a real number anywhere near the origin." };
  }

  const path = buildSpiral(safeDomain, safeTurns, samples);
  const points: SpiralPoint[] = path.map((point) => ({
    ...point,
    z: surface(point.x, point.y),
  }));

  const zValues = points.map((point) => point.z);
  const { min: zMin, max: zMax } = robustRange(zValues);
  const undefinedCount = zValues.reduce((total, z) => total + (Number.isFinite(z) ? 0 : 1), 0);

  return {
    expression,
    domain: safeDomain,
    turns: safeTurns,
    points,
    features: findFeatures(points, zMin, zMax),
    zMin,
    zMax,
    undefinedRatio: undefinedCount / points.length,
    error: null,
  };
}

/**
 * Dense square grid of z values for the heatmap, row major from y = +domain
 * down to y = -domain so it can be written straight into image data.
 */
export function sampleGrid(
  expression: string,
  domain: number,
  resolution: number = GRID_RESOLUTION,
): Float64Array | null {
  let surface: SurfaceFn;
  try {
    surface = compileSurface(expression);
  } catch {
    return null;
  }

  const grid = new Float64Array(resolution * resolution);
  for (let row = 0; row < resolution; row += 1) {
    const y = domain - (2 * domain * row) / (resolution - 1);
    for (let column = 0; column < resolution; column += 1) {
      const x = -domain + (2 * domain * column) / (resolution - 1);
      grid[row * resolution + column] = surface(x, y);
    }
  }
  return grid;
}

export interface SurfacePreset {
  label: string;
  expression: string;
  /** One line on what the surface sounds like, read out by screen readers. */
  description: string;
  domain: number;
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    label: "Egg carton",
    expression: "sin(x) * cos(y)",
    description:
      "A regular grid of peaks and hollows. The pitch rises and falls in a steady pattern as the spiral widens.",
    domain: 6,
  },
  {
    label: "Paraboloid",
    expression: "x^2 + y^2",
    description: "A single bowl. Pitch climbs continuously as the spiral moves away from the centre.",
    domain: 5,
  },
  {
    label: "Saddle",
    expression: "x^2 - y^2",
    description:
      "A saddle point at the origin. Each revolution sweeps twice from high to low, a clear two-beat pulse.",
    domain: 5,
  },
  {
    label: "Ripple",
    expression: "sin(sqrt(x^2 + y^2) * 3) / (1 + sqrt(x^2 + y^2))",
    description:
      "Concentric waves fading outwards. Pitch oscillates in rings that grow quieter as they widen.",
    domain: 8,
  },
  {
    label: "Monkey saddle",
    expression: "x^3 - 3*x*y^2",
    description: "Three rising and three falling regions around the origin, a three-beat pulse per turn.",
    domain: 3,
  },
  {
    label: "Gaussian peak",
    expression: "exp(-(x^2 + y^2) / 4)",
    description: "One smooth hill at the centre that fades to silence at the edge.",
    domain: 6,
  },
  {
    label: "Hyperbolic poles",
    expression: "1 / (x * y)",
    description: "Undefined along both axes. Listen for the gaps where the tone drops out entirely.",
    domain: 5,
  },
];
