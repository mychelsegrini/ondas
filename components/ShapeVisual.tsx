"use client";

import { useMemo } from "react";

import type { Vec3 } from "@/lib/shapes";

const VIEW = 100;
const PADDING = 8;
const ROTATION = 0.62;

interface Projected {
  x: number;
  y: number;
}

/**
 * Draws the exact path the spatial scan follows, projected with a light
 * perspective. The visual and the audio are the same data, so sighted and blind
 * users are literally following the same line.
 */
export function ShapeVisual({
  path,
  progress,
  className,
}: {
  path: Vec3[];
  progress: number | null;
  className?: string;
}) {
  const { points, polyline } = useMemo(() => {
    const cos = Math.cos(ROTATION);
    const sin = Math.sin(ROTATION);

    const raw: Projected[] = path.map((p) => {
      const depth = -p.x * sin + p.z * cos;
      const scale = 1 / (1 + depth * 0.18);
      return {
        x: (p.x * cos + p.z * sin) * scale,
        y: (-p.y + depth * 0.32) * scale,
      };
    });

    const xs = raw.map((p) => p.x);
    const ys = raw.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const usable = VIEW - PADDING * 2;
    const offsetX = PADDING + (usable - ((maxX - minX) / span) * usable) / 2;
    const offsetY = PADDING + (usable - ((maxY - minY) / span) * usable) / 2;

    const fitted: Projected[] = raw.map((p) => ({
      x: offsetX + ((p.x - minX) / span) * usable,
      y: offsetY + ((p.y - minY) / span) * usable,
    }));

    return {
      points: fitted,
      polyline: fitted.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" "),
    };
  }, [path]);

  const headIndex =
    progress === null ? null : Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
  const head = headIndex === null ? null : points[headIndex];

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={head ? 0.45 : 0.75}
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
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={head.x} cy={head.y} r={3.4} className="fill-fuchsia-500/30" />
          <circle cx={head.x} cy={head.y} r={1.8} className="fill-fuchsia-400" />
        </>
      ) : null}
    </svg>
  );
}
