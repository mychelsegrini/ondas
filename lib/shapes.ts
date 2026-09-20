export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Shape3D {
  id: string;
  name: string;
  tagline: string;
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
const PHI = (1 + Math.sqrt(5)) / 2;

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

const CUBE_VERTICES: Vec3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: -1, z: 1 },
  { x: -1, y: -1, z: 1 },
  { x: -1, y: 1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
];

function dodecahedronVertices(): Vec3[] {
  const inv = 1 / PHI;
  const raw: Vec3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        raw.push({ x: sx, y: sy, z: sz });
      }
    }
  }
  for (const a of [-inv, inv]) {
    for (const b of [-PHI, PHI]) {
      raw.push({ x: 0, y: a, z: b });
      raw.push({ x: a, y: b, z: 0 });
      raw.push({ x: b, y: 0, z: a });
    }
  }
  const scale = 1 / PHI;
  return raw.map((v) => ({ x: v.x * scale, y: v.y * scale, z: v.z * scale }));
}

/**
 * Groups vertices into horizontal rings and walks them ring by ring, which makes
 * a faceted solid audible as a sequence of stacked circular sweeps.
 */
function ringWalk(vertices: Vec3[], samples: number): Vec3[] {
  const rings = new Map<string, Vec3[]>();
  for (const vertex of vertices) {
    const key = vertex.y.toFixed(3);
    const ring = rings.get(key);
    if (ring) ring.push(vertex);
    else rings.set(key, [vertex]);
  }
  const ordered = [...rings.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .flatMap(([, ring]) => {
      const sorted = ring.sort((p, q) => Math.atan2(p.z, p.x) - Math.atan2(q.z, q.x));
      return [...sorted, sorted[0]];
    });
  return walkPolyline(ordered, samples, true);
}

export const SHAPES: Shape3D[] = [
  {
    id: "sphere",
    name: "Sphere",
    tagline: "Every point equidistant from the centre",
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
    tagline: "Six square faces, twelve straight edges",
    description:
      "A cube: six identical square faces meeting at right angles, with eight vertices and twelve edges.",
    listenFor:
      "Long straight glides separated by abrupt turns. Each sudden change of direction is a vertex, and the pitch stays on two flat levels because the bottom and top faces are horizontal.",
    scanSeconds: 8,
    buildPath: (samples) => walkPolyline(CUBE_VERTICES, samples, true),
  },
  {
    id: "pyramid",
    name: "Pyramid",
    tagline: "A square base converging to a single apex",
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
    id: "saddle",
    name: "Hyperbolic Paraboloid",
    tagline: "The saddle: curving up one way, down the other",
    description:
      "A hyperbolic paraboloid, or saddle, given by z equals x squared minus y squared. It curves upward along one axis and downward along the perpendicular axis.",
    listenFor:
      "Sweeping left to right the pitch rises at both ends and dips in the middle. Move to the next row and the same sweep inverts. That contradiction is exactly what makes a saddle.",
    scanSeconds: 11,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const rows = 7;
        const row = Math.min(rows - 1, Math.floor(t * rows));
        const withinRow = t * rows - row;
        const v = (row / (rows - 1)) * 2 - 1;
        // Boustrophedon: alternate rows sweep the opposite way, like reading braille.
        const u = row % 2 === 0 ? withinRow * 2 - 1 : 1 - withinRow * 2;
        return { x: u, y: (u * u - v * v) * 0.9, z: v };
      }),
  },
  {
    id: "torus",
    name: "Torus",
    tagline: "A surface with a hole through the middle",
    description:
      "A torus: a doughnut shaped surface generated by revolving a circle around an axis that does not touch it.",
    listenFor:
      "Two rhythms at once. A fast pitch wobble as the scan winds around the tube, and a slow orbit around your head as it travels the main ring.",
    scanSeconds: 10,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const main = t * TAU;
        const tube = t * TAU * 9;
        const R = 0.72;
        const r = 0.3;
        const radial = R + r * Math.cos(tube);
        return { x: radial * Math.cos(main), y: r * Math.sin(tube), z: radial * Math.sin(main) };
      }),
  },
  {
    id: "cylinder",
    name: "Cylinder",
    tagline: "Two parallel circles joined by a straight wall",
    description:
      "A cylinder: two parallel circular bases connected by a curved lateral surface of constant radius.",
    listenFor:
      "A circle at a steady low pitch, a single vertical climb, then the same circle again a fixed interval higher. The two identical orbits tell you the walls never taper.",
    scanSeconds: 9,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        if (t < 0.42) {
          const angle = (t / 0.42) * TAU;
          return { x: Math.cos(angle), y: -0.9, z: Math.sin(angle) };
        }
        if (t < 0.5) {
          const rise = (t - 0.42) / 0.08;
          return { x: 1, y: -0.9 + rise * 1.8, z: 0 };
        }
        const angle = ((t - 0.5) / 0.5) * TAU;
        return { x: Math.cos(angle), y: 0.9, z: Math.sin(angle) };
      }),
  },
  {
    id: "cone",
    name: "Cone",
    tagline: "A circular base narrowing to a point",
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
    id: "ellipsoid",
    name: "Ellipsoid",
    tagline: "A sphere stretched along its axes",
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
  {
    id: "mobius",
    name: "Möbius Strip",
    tagline: "One surface, one edge, half a twist",
    description:
      "A Möbius strip: a band given a half twist before its ends are joined, leaving a surface with only one side and one edge.",
    listenFor:
      "Follow one full lap and the scan ends up on the opposite side of the band without ever crossing an edge. The pitch inverts against the orbit: that is the half twist.",
    scanSeconds: 11,
    buildPath: (samples) =>
      sampleParametric(samples, (t) => {
        const u = t * TAU * 2;
        const w = 0.45 * Math.sin(t * TAU * 5);
        const radial = 1 + w * Math.cos(u / 2);
        return { x: radial * Math.cos(u) * 0.75, y: w * Math.sin(u / 2) * 1.6, z: radial * Math.sin(u) * 0.75 };
      }),
  },
  {
    id: "dodecahedron",
    name: "Dodecahedron",
    tagline: "Twelve pentagonal faces, twenty vertices",
    description:
      "A regular dodecahedron: one of the five Platonic solids, built from twelve identical regular pentagons meeting at twenty vertices.",
    listenFor:
      "Discrete stacked rings rather than a smooth curve. Each cluster of sharp turns is one pentagonal band, and the rings are widest around the equator.",
    scanSeconds: 12,
    buildPath: (samples) => ringWalk(dodecahedronVertices(), samples),
  },
];

export function getShape(id: string): Shape3D | undefined {
  return SHAPES.find((shape) => shape.id === id);
}
