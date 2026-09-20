export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * `scan` shapes are traced by a tone travelling along `buildPath`.
 * `randomPoint` has no path at all: it places a single ping somewhere around
 * the listener, which is the purest possible test of spatial hearing.
 */
export type Shape3DKind = "scan" | "randomPoint";

export interface Shape3D {
  id: string;
  name: string;
  tagline: string;
  kind: Shape3DKind;
  /** Read out by the screen reader before the scan starts. */
  description: string;
  /** What the listener should pay attention to during the scan. */
  listenFor: string;
  /** Seconds the automatic spatial scan takes. */
  scanSeconds: number;
  /** Parametric scan path, already normalised to roughly [-1, 1] on each axis. */
  buildPath: (samples: number) => Vec3[];
}

const TAU = Math.PI * 2;

/**
 * Throughout this file `y` is the vertical axis, because that is what the Web
 * Audio listener treats as up. The stacked solids below therefore rise along
 * `y`, which corresponds to the z axis in the usual mathematical description.
 */

/** Walks a list of vertices at constant speed, optionally closing the loop. */
function walkPolyline(vertices: Vec3[], samples: number, close = true): Vec3[] {
  const nodes = close ? [...vertices, vertices[0]] : vertices;
  const segments = nodes.length - 1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    lengths.push(length);
    total += length;
  }

  const path: Vec3[] = [];
  for (let i = 0; i < samples; i += 1) {
    const target = (i / (samples - 1)) * total;
    let travelled = 0;
    let segment = 0;
    while (segment < segments - 1 && travelled + lengths[segment] < target) {
      travelled += lengths[segment];
      segment += 1;
    }
    const local = lengths[segment] === 0 ? 0 : (target - travelled) / lengths[segment];
    const a = nodes[segment];
    const b = nodes[segment + 1];
    path.push({
      x: a.x + (b.x - a.x) * local,
      y: a.y + (b.y - a.y) * local,
      z: a.z + (b.z - a.z) * local,
    });
  }
  return path;
}

function sampleParametric(samples: number, fn: (t: number) => Vec3): Vec3[] {
  const path: Vec3[] = new Array(samples);
  for (let i = 0; i < samples; i += 1) {
    path[i] = fn(i / (samples - 1));
  }
  return path;
}

/**
 * The shared skeleton of every prismatic solid: identical horizontal outlines
 * stacked at regular heights, each traced in full before the scan steps up.
 * Because the outline never changes size, the listener hears one repeating
 * orbit at rising pitches, which is exactly what "constant cross section"
 * means. `outline` returns a point on the unit cross section for t in [0, 1).
 */
function stackedLevels(
  samples: number,
  levels: number,
  outline: (t: number) => { x: number; z: number },
): Vec3[] {
  const path: Vec3[] = new Array(samples);
  // A small share of each level is spent climbing to the next one.
  const climbShare = 0.12;
  for (let i = 0; i < samples; i += 1) {
    const global = (i / (samples - 1)) * levels;
    const level = Math.min(levels - 1, Math.floor(global));
    const within = global - level;
    const base = levels === 1 ? 0 : level / (levels - 1);
    const next = levels === 1 ? 0 : Math.min(1, (level + 1) / (levels - 1));

    if (within < 1 - climbShare) {
      const t = within / (1 - climbShare);
      const { x, z } = outline(t);
      path[i] = { x, y: base * 2 - 1, z };
    } else {
      // Vertical riser at the outline's start point, joining two levels.
      const t = (within - (1 - climbShare)) / climbShare;
      const { x, z } = outline(0);
      path[i] = { x, y: (base + (next - base) * t) * 2 - 1, z };
    }
  }
  return path;
}

/** Point on a regular polygon of `sides`, inscribed in the unit circle. */
function polygonOutline(sides: number, radius = 1, stretchX = 1, stretchZ = 1) {
  return (t: number) => {
    const edge = t * sides;
    const index = Math.min(sides - 1, Math.floor(edge));
    const local = edge - index;
    const angleA = (index / sides) * TAU + Math.PI / 4;
    const angleB = ((index + 1) / sides) * TAU + Math.PI / 4;
    const ax = Math.cos(angleA) * radius * stretchX;
    const az = Math.sin(angleA) * radius * stretchZ;
    const bx = Math.cos(angleB) * radius * stretchX;
    const bz = Math.sin(angleB) * radius * stretchZ;
    return { x: ax + (bx - ax) * local, z: az + (bz - az) * local };
  };
}

export const SHAPES: Shape3D[] = [
  {
    id: "random-point",
    name: "Single Random Point",
    tagline: "One ping, somewhere around you",
    kind: "randomPoint",
    description:
      "A single point placed at a random position in the space around you. There is no shape to trace, only a direction to find.",
    listenFor:
      "One short ping. Before anything else, decide whether it came from your left or right, above or below, in front or behind. Press again for a new position.",
    scanSeconds: 1,
    buildPath: () => [],
  },
  {
    id: "sphere",
    name: "Sphere",
    tagline: "Every point equidistant from the centre",
    kind: "scan",
    description:
      "A sphere: the set of all points at the same distance from a centre. It has no edges and no vertices.",
    listenFor:
      "The pitch glides smoothly from the south pole to the north pole while the sound orbits your head at a constant distance. Nothing ever jumps, because the surface is perfectly even.",
    scanSeconds: 9,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const polar = t * Math.PI;
        const azimuth = t * TAU * 7;
        const ring = Math.sin(polar);
        return { x: ring * Math.cos(azimuth), y: Math.cos(polar), z: ring * Math.sin(azimuth) };
      }),
  },
  {
    id: "cube",
    name: "Cube",
    tagline: "Stacked squares of identical size",
    kind: "scan",
    description:
      "A cube: six identical square faces meeting at right angles. Scanned as a stack of equal squares in the horizontal plane, rising level by level.",
    listenFor:
      "Each level is one square: four straight glides separated by four sharp clicks at the corners. The corners arrive at the same four moments on every level, and the pitch steps up between them. Same square, higher note, all the way up.",
    scanSeconds: 12,
    buildPath: (samples) => stackedLevels(samples, 5, polygonOutline(4, Math.SQRT2)),
  },
  {
    id: "rectangular-prism",
    name: "Rectangular Prism",
    tagline: "Stacked rectangles, wider than they are deep",
    kind: "scan",
    description:
      "A rectangular prism, or cuboid: like a cube, but with a rectangular cross section, so its width and depth differ.",
    listenFor:
      "The same stacked structure as the cube, but the orbit is lopsided. The two long sides take noticeably longer to travel than the two short ones, so each level has a long, short, long, short rhythm.",
    scanSeconds: 12,
    buildPath: (samples) => stackedLevels(samples, 5, polygonOutline(4, Math.SQRT2, 1.5, 0.55)),
  },
  {
    id: "triangular-prism",
    name: "Triangular Prism",
    tagline: "Stacked triangles of identical size",
    kind: "scan",
    description:
      "A triangular prism: two parallel triangular faces joined by three rectangular faces. Scanned as a stack of equal triangles, rising level by level.",
    listenFor:
      "Three clicks per level instead of four. Count them and you know the cross section is a triangle without ever seeing it.",
    scanSeconds: 12,
    buildPath: (samples) => stackedLevels(samples, 5, polygonOutline(3)),
  },
  {
    id: "cylinder",
    name: "Cylinder",
    tagline: "Stacked circles of identical radius",
    kind: "scan",
    description:
      "A cylinder: a circular cross section of constant radius, extended vertically. Scanned as a stack of equal circles, rising level by level.",
    listenFor:
      "Every level is a smooth, uninterrupted orbit with no clicks at all, because a circle has no corners. The orbit is exactly the same width on every level, and only the pitch rises. Compare it with the cone, where the orbit shrinks.",
    scanSeconds: 12,
    buildPath: (samples) =>
      stackedLevels(samples, 5, (t) => ({ x: Math.cos(t * TAU), z: Math.sin(t * TAU) })),
  },
  {
    id: "cone",
    name: "Cone",
    tagline: "A circular base narrowing to a point",
    kind: "scan",
    description:
      "A cone: a circular base joined to a single apex by a lateral surface that tapers linearly.",
    listenFor:
      "The orbit shrinks as the pitch rises. The sound spirals inward and, at the very top, stops moving altogether: that is the apex.",
    scanSeconds: 9,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const angle = t * TAU * 6;
        const radius = 1 - t;
        return { x: radius * Math.cos(angle), y: t * 2 - 1, z: radius * Math.sin(angle) };
      }),
  },
  {
    id: "pyramid",
    name: "Pyramid",
    tagline: "A square base converging to a single apex",
    kind: "scan",
    description:
      "A square pyramid: a square base with four triangular faces that meet at one apex above the centre.",
    listenFor:
      "A flat circuit around the base at a low pitch, then four rising ramps that all arrive at the same high note. That repeated destination is the apex.",
    scanSeconds: 8,
    buildPath: (samples) => {
      const apex: Vec3 = { x: 0, y: 1, z: 0 };
      const base: Vec3[] = [
        { x: -1, y: -0.8, z: -1 },
        { x: 1, y: -0.8, z: -1 },
        { x: 1, y: -0.8, z: 1 },
        { x: -1, y: -0.8, z: 1 },
      ];
      return walkPolyline(
        [base[0], base[1], base[2], base[3], base[0], apex, base[1], apex, base[2], apex, base[3]],
        samples,
        false,
      );
    },
  },
  {
    id: "ellipsoid",
    name: "Ellipsoid",
    tagline: "A sphere stretched along its axes",
    kind: "scan",
    description:
      "An ellipsoid: a sphere scaled by a different factor along each axis, so its three semi axes have different lengths.",
    listenFor:
      "Like the sphere, but the orbit is wider than it is tall. Compare it with the sphere and you hear the stretch as a longer left to right travel for the same pitch range.",
    scanSeconds: 9,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const polar = t * Math.PI;
        const azimuth = t * TAU * 7;
        const ring = Math.sin(polar);
        return {
          x: ring * Math.cos(azimuth) * 1.35,
          y: Math.cos(polar) * 0.6,
          z: ring * Math.sin(azimuth) * 0.85,
        };
      }),
  },
];

export function getShape(id: string): Shape3D | undefined {
  return SHAPES.find((shape) => shape.id === id);
}

/** A random position on a sphere around the listener, in normalised units. */
export function randomSpatialPoint(): Vec3 {
  const azimuth = Math.random() * TAU;
  // Biased away from directly overhead, where human localisation is weakest.
  const elevation = (Math.random() - 0.5) * 1.2;
  const horizontal = Math.cos(elevation);
  return {
    x: horizontal * Math.sin(azimuth),
    y: Math.sin(elevation),
    z: -horizontal * Math.cos(azimuth),
  };
}

/** Plain language direction of a point, for the screen reader announcement. */
export function describeDirection(point: Vec3): string {
  const side = point.x > 0.25 ? "right" : point.x < -0.25 ? "left" : "centre";
  // The listener faces negative z, so a positive z is behind them.
  const depth = point.z > 0.3 ? "behind you" : point.z < -0.3 ? "in front of you" : "level with you";
  const height = point.y > 0.25 ? "above" : point.y < -0.25 ? "below" : "at ear level";
  return side === "centre"
    ? `Centred, ${depth}, ${height}`
    : `To your ${side}, ${depth}, ${height}`;
}
