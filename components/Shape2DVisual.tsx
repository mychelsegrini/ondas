"use client";

import { useMemo } from "react";

import type { Vec2 } from "@/lib/shapes2d";

const VIEW = 100;
const PADDING = 12;

/**
 * Draws the exact outline the scan traverses, so the picture and the sound are
 * the same data. The scan head is shown at its current position, with the
 * already traced part of the perimeter highlighted behind it.
 */
export function Shape2DVisual({
  path,
  progress,
  className,
}: {
  path: Vec2[];
  progress: number | null;
  className?: string;
}) {
  const points = useMemo(() => {
    const usable = VIEW - PADDING * 2;
    return path.map((p) => ({
      // The SVG y axis grows downward, so height is flipped here.
      x: PADDING + ((p.x + 1) / 2) * usable,
      y: PADDING + ((1 - p.y) / 2) * usable,
    }));
  }, [path]);

  const outline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const headIndex =
    progress === null
      ? null
      : Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
  const head = headIndex === null ? null : points[headIndex];

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points={outline}
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeOpacity={head ? 0.45 : 0.9}
      />
      {head && headIndex !== null ? (
        <>
          <polyline
            points={points
              .slice(0, headIndex + 1)
              .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={head.x} cy={head.y} r={4.5} className="fill-fuchsia-500/30" />
          <circle cx={head.x} cy={head.y} r={2.4} className="fill-fuchsia-400" />
        </>
      ) : null}
    </svg>
  );
}
