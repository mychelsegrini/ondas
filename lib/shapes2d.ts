export interface Vec2 {
  x: number;
  y: number;
}

export interface Shape2D {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** What the listener should pay attention to during the perimeter scan. */
  listenFor: string;
  /** Seconds one full trip around the perimeter takes. */
  scanSeconds: number;
  /** Number of corners, announced and used to set expectations for the clicks. */
  corners: number;
  /** Perimeter path, normalised to roughly [-1, 1] on both axes. */
  buildPath: (samples: number) => Vec2[];
}

const TAU = Math.PI * 2;

/** Traverses a closed outline at constant speed, so travel time equals length. */
function walkPerimeter(vertices: Vec2[], samples: number): Vec2[] {
  const nodes = [...vertices, vertices[0]];
  const segments = nodes.length - 1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    lengths.push(Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y));
    total += lengths[i];
  }

  const path: Vec2[] = new Array(samples);
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
    path[i] = { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
  }
  return path;
}

/**
 * Vertices of a regular polygon. The start angle puts the first vertex at the
 * top, so every shape begins its scan at its highest point and the pitch
 * contour of different polygons can be compared directly.
 */
function regularPolygon(sides: number, radius = 1): Vec2[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * TAU - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: -Math.sin(angle) * radius };
  });
}

export const SHAPES_2D: Shape2D[] = [
  {
    id: "square",
    name: "Square",
    tagline: "Four equal sides, four right angles",
    description: "A square: four sides of equal length meeting at four right angles.",
    listenFor:
      "Four clicks spaced perfectly evenly, because every side takes the same time to travel. Between them the pitch rises and falls in a rigid, symmetric pattern.",
    scanSeconds: 7,
    corners: 4,
    buildPath: (samples) =>
      walkPerimeter(
        [
          { x: -0.85, y: -0.85 },
          { x: 0.85, y: -0.85 },
          { x: 0.85, y: 0.85 },
          { x: -0.85, y: 0.85 },
        ],
        samples,
      ),
  },
  {
    id: "rectangle",
    name: "Rectangle",
    tagline: "Right angles, but unequal sides",
    description:
      "A rectangle: four right angles like a square, but with one pair of sides longer than the other.",
    listenFor:
      "Still four clicks, but no longer evenly spaced. Long, short, long, short. That uneven rhythm is the only difference between this and the square, and it is what unequal sides sound like.",
    scanSeconds: 7,
    corners: 4,
    buildPath: (samples) =>
      walkPerimeter(
        [
          { x: -1, y: -0.5 },
          { x: 1, y: -0.5 },
          { x: 1, y: 0.5 },
          { x: -1, y: 0.5 },
        ],
        samples,
      ),
  },
  {
    id: "triangle",
    name: "Equilateral Triangle",
    tagline: "Three equal sides, three equal angles",
    description:
      "An equilateral triangle: three sides of equal length and three angles of sixty degrees.",
    listenFor:
      "Three evenly spaced clicks. The pitch sweeps from the single high apex down to the flat base, so each lap has one clear peak rather than the two of a square.",
    scanSeconds: 7,
    corners: 3,
    buildPath: (samples) => walkPerimeter(regularPolygon(3), samples),
  },
  {
    id: "circle",
    name: "Circle",
    tagline: "No corners at all",
    description: "A circle: every point on the outline is the same distance from the centre.",
    listenFor:
      "Complete silence where the clicks would be. The pitch traces a smooth wave up and down with no interruption anywhere, which is what having no corners sounds like.",
    scanSeconds: 7,
    corners: 0,
    buildPath: (samples) =>
      Array.from({ length: samples }, (_, i) => {
        const angle = (i / (samples - 1)) * TAU - Math.PI / 2;
        return { x: Math.cos(angle), y: -Math.sin(angle) };
      }),
  },
  {
    id: "pentagon",
    name: "Regular Pentagon",
    tagline: "Five equal sides",
    description: "A regular pentagon: five equal sides and five equal interior angles.",
    listenFor:
      "Five evenly spaced clicks per lap. The sides are shorter than a triangle's, so the clicks come faster and the pitch contour is gentler: the closer a polygon gets to a circle, the smoother it sounds.",
    scanSeconds: 7,
    corners: 5,
    buildPath: (samples) => walkPerimeter(regularPolygon(5), samples),
  },
  {
    id: "hexagon",
    name: "Regular Hexagon",
    tagline: "Six equal sides",
    description: "A regular hexagon: six equal sides and six equal interior angles.",
    listenFor:
      "Six quick, even clicks. Play this straight after the circle: the pitch contour is nearly identical, and only the faint corner clicks tell you the outline is still made of straight lines.",
    scanSeconds: 7,
    corners: 6,
    buildPath: (samples) => walkPerimeter(regularPolygon(6), samples),
  },
];

export function getShape2D(id: string): Shape2D | undefined {
  return SHAPES_2D.find((shape) => shape.id === id);
}
