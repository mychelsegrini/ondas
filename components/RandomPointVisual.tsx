"use client";

import type { Vec3 } from "@/lib/shapes";

const VIEW = 100;
const CENTRE = VIEW / 2;
const RADIUS = 38;

/**
 * A plan view of the space around the listener: the listener sits at the
 * centre facing up, and the dot shows where the last ping came from. Dot size
 * carries elevation, so a higher point reads as a larger mark.
 */
export function RandomPointVisual({ point, className }: { point: Vec3 | null; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.6}
        strokeDasharray="2 3"
        opacity={0.5}
      />
      <line
        x1={CENTRE - RADIUS}
        y1={CENTRE}
        x2={CENTRE + RADIUS}
        y2={CENTRE}
        stroke="currentColor"
        strokeWidth={0.4}
        opacity={0.3}
      />
      <line
        x1={CENTRE}
        y1={CENTRE - RADIUS}
        x2={CENTRE}
        y2={CENTRE + RADIUS}
        stroke="currentColor"
        strokeWidth={0.4}
        opacity={0.3}
      />
      <circle cx={CENTRE} cy={CENTRE} r={2} fill="currentColor" opacity={0.6} />
      {point ? (
        <>
          <circle
            cx={CENTRE + point.x * RADIUS}
            cy={CENTRE + point.z * RADIUS}
            r={5 + point.y * 2.5}
            className="fill-fuchsia-500/25"
          />
          <circle
            cx={CENTRE + point.x * RADIUS}
            cy={CENTRE + point.z * RADIUS}
            r={2.4 + point.y * 1.2}
            className="fill-fuchsia-400"
          />
        </>
      ) : null}
    </svg>
  );
}
