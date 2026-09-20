import { compile, derivative, parse } from "mathjs";

export type CriticalKind = "max" | "min" | "inflection";

export interface SamplePoint {
  x: number;
  /** f(x). NaN when the function is undefined or non real at this x. */
  y: number;
  /** f'(x) */
  dy: number;
  /** f''(x) */
  d2y: number;
}

export interface CriticalPoint {
  kind: CriticalKind;
  x: number;
  y: number;
  /** Index of the closest sample, used to trigger earcons while scrubbing. */
  index: number;
}

export interface FunctionAnalysis {
  expression: string;
  xMin: number;
  xMax: number;
  points: SamplePoint[];
  criticalPoints: CriticalPoint[];
  /** Plot window on the y axis, robust against asymptotes. */
  yMin: number;
  yMax: number;
  error: string | null;
}

export const SAMPLE_COUNT = 720;

type NumericFn = (x: number) => number;

function toFiniteNumber(value: unknown): number {
  // mathjs can return Complex, Unit, BigNumber... anything non real is "undefined here".
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function compileExpression(expression: string): NumericFn {
  const compiled = compile(expression);
  return (x: number) => {
    try {
      return toFiniteNumber(compiled.evaluate({ x }));
    } catch {
      return Number.NaN;
    }
  };
}

/**
 * Symbolic derivative when mathjs can produce one (exact and cheap), otherwise a
 * central difference fallback so that non differentiable-by-mathjs expressions
 * such as `abs(x)` still sonify.
 */
function buildDerivative(expression: string, order: 1 | 2, base: NumericFn): NumericFn {
  try {
    let node = parse(expression);
    for (let i = 0; i < order; i += 1) {
      node = derivative(node, "x");
    }
    const compiled = node.compile();
    const symbolic: NumericFn = (x) => {
      try {
        return toFiniteNumber(compiled.evaluate({ x }));
      } catch {
        return Number.NaN;
      }
    };
    // Sanity check: if the symbolic form is unusable, fall back to numeric.
    if (Number.isFinite(symbolic(0.37)) || Number.isFinite(symbolic(1.13))) {
      return symbolic;
    }
  } catch {
    /* fall through to the numeric approximation */
  }

  const h = 1e-4;
  if (order === 1) {
    return (x) => (base(x + h) - base(x - h)) / (2 * h);
  }
  return (x) => (base(x + h) - 2 * base(x) + base(x - h)) / (h * h);
}

/** Bisection on a function that changes sign between a and b. */
function refineRoot(fn: NumericFn, a: number, b: number, iterations = 48): number {
  let lo = a;
  let hi = b;
  let fLo = fn(lo);
  if (!Number.isFinite(fLo)) return (a + b) / 2;

  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) return mid;
    if (fMid === 0) return mid;
    if (fLo < 0 !== fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Plot window that ignores the extreme tails, so a single asymptote (tan, 1/x)
 * does not flatten the whole curve into a horizontal line.
 */
function robustRange(values: number[]): { min: number; max: number } {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return { min: -1, max: 1 };

  const min = finite[0];
  const max = finite[finite.length - 1];
  const p02 = finite[Math.floor(finite.length * 0.02)];
  const p98 = finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.98))];
  const fullSpan = max - min;
  const innerSpan = p98 - p02;

  // Only clip when the tails dominate the shape of the curve.
  const useInner = innerSpan > 0 && fullSpan > innerSpan * 8;
  let lo = useInner ? p02 : min;
  let hi = useInner ? p98 : max;

  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const padding = (hi - lo) * 0.08;
  return { min: lo - padding, max: hi + padding };
}

function nearestIndex(xMin: number, xMax: number, count: number, x: number): number {
  const step = (xMax - xMin) / (count - 1);
  return Math.min(count - 1, Math.max(0, Math.round((x - xMin) / step)));
}

export function analyzeFunction(
  expression: string,
  xMin: number,
  xMax: number,
  sampleCount = SAMPLE_COUNT,
): FunctionAnalysis {
  const empty: FunctionAnalysis = {
    expression,
    xMin,
    xMax,
    points: [],
    criticalPoints: [],
    yMin: -1,
    yMax: 1,
    error: null,
  };

  if (!expression.trim()) {
    return { ...empty, error: "Enter a function of x, for example x^2 or sin(x) * x." };
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax - xMin <= 0) {
    return { ...empty, error: "The domain is invalid: x max must be greater than x min." };
  }

  let f: NumericFn;
  try {
    f = compileExpression(expression);
  } catch (error) {
    return {
      ...empty,
      error: `That expression could not be parsed: ${(error as Error).message}`,
    };
  }

  const df = buildDerivative(expression, 1, f);
  const d2f = buildDerivative(expression, 2, f);

  const step = (xMax - xMin) / (sampleCount - 1);
  const points: SamplePoint[] = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const x = xMin + i * step;
    points[i] = { x, y: f(x), dy: df(x), d2y: d2f(x) };
  }

  if (points.every((p) => !Number.isFinite(p.y))) {
    return {
      ...empty,
      points,
      error: "The function is not defined anywhere on this domain. Try a different range.",
    };
  }

  const { min: yMin, max: yMax } = robustRange(points.map((p) => p.y));
  const yScale = yMax - yMin;
  // A jump larger than a quarter of the window between neighbouring samples is an
  // asymptote, not a real feature, so sign changes across it are discarded.
  const jumpLimit = yScale * 0.25;

  const isContinuous = (a: SamplePoint, b: SamplePoint) =>
    Number.isFinite(a.y) && Number.isFinite(b.y) && Math.abs(b.y - a.y) < jumpLimit;

  const criticalPoints: CriticalPoint[] = [];

  for (let i = 1; i < sampleCount; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!isContinuous(prev, curr)) continue;
    if (!Number.isFinite(prev.dy) || !Number.isFinite(curr.dy)) continue;

    // Extremum: f' changes sign.
    if (prev.dy < 0 !== curr.dy < 0 && prev.dy !== 0) {
      const x = refineRoot(df, prev.x, curr.x);
      const y = f(x);
      if (Number.isFinite(y)) {
        const curvature = d2f(x);
        let kind: CriticalKind | null = null;
        if (Number.isFinite(curvature) && Math.abs(curvature) > 1e-7) {
          kind = curvature > 0 ? "min" : "max";
        } else {
          kind = prev.dy > 0 && curr.dy < 0 ? "max" : "min";
        }
        criticalPoints.push({ kind, x, y, index: nearestIndex(xMin, xMax, sampleCount, x) });
      }
    }

    // Inflection: f'' changes sign.
    if (
      Number.isFinite(prev.d2y) &&
      Number.isFinite(curr.d2y) &&
      prev.d2y < 0 !== curr.d2y < 0 &&
      prev.d2y !== 0
    ) {
      const x = refineRoot(d2f, prev.x, curr.x);
      const y = f(x);
      if (Number.isFinite(y)) {
        criticalPoints.push({
          kind: "inflection",
          x,
          y,
          index: nearestIndex(xMin, xMax, sampleCount, x),
        });
      }
    }
  }

  criticalPoints.sort((a, b) => a.x - b.x);

  // Numerical noise can produce clusters; keep one marker per neighbourhood and
  // let extrema win over inflections at the same spot.
  const minSeparation = (xMax - xMin) / 120;
  const deduped: CriticalPoint[] = [];
  for (const point of criticalPoints) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.x - point.x) < minSeparation) {
      if (last.kind === "inflection" && point.kind !== "inflection") {
        deduped[deduped.length - 1] = point;
      }
      continue;
    }
    deduped.push(point);
  }

  return {
    expression,
    xMin,
    xMax,
    points,
    criticalPoints: deduped,
    yMin,
    yMax,
    error: null,
  };
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "undefined";
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Spoken description of a critical point, used by the live region and earcon captions. */
export function describeCriticalPoint(point: CriticalPoint): string {
  const label =
    point.kind === "max" ? "Local maximum" : point.kind === "min" ? "Local minimum" : "Inflection point";
  return `${label} at x ${formatNumber(point.x)}, y ${formatNumber(point.y)}`;
}

export function describeSlope(dy: number): string {
  if (!Number.isFinite(dy)) return "undefined slope";
  if (Math.abs(dy) < 0.05) return "flat";
  const steepness = Math.abs(dy) > 3 ? "steeply" : "gently";
  return dy > 0 ? `rising ${steepness}` : `falling ${steepness}`;
}
