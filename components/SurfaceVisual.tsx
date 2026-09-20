"use client";

import { useEffect, useMemo, useRef } from "react";

import { GRID_RESOLUTION, sampleGrid, type SpiralPoint, type SurfaceAnalysis } from "@/lib/math/surface";

const COLORS = {
  grid: "#27272a",
  axis: "#52525b",
  axisText: "#71717a",
  spiral: "rgba(34, 211, 238, 0.85)",
  cursor: "#fafafa",
  low: { r: 6, g: 78, b: 89 },
  high: { r: 217, g: 70, b: 239 },
  undefined: { r: 24, g: 24, b: 27 },
} as const;

const PADDING = { top: 24, right: 24, bottom: 34, left: 52 };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function formatTick(value: number): string {
  const text = value.toFixed(Math.abs(value) >= 10 ? 0 : 1);
  return text.replace(/\.0$/, "") || "0";
}

export function SurfaceVisual({
  analysis,
  cursor,
}: {
  analysis: SurfaceAnalysis;
  cursor: SpiralPoint | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const grid = useMemo(
    () => (analysis.error ? null : sampleGrid(analysis.expression, analysis.domain, GRID_RESOLUTION)),
    [analysis.domain, analysis.error, analysis.expression],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const plotWidth = width - PADDING.left - PADDING.right;
      const plotHeight = height - PADDING.top - PADDING.bottom;
      if (plotWidth <= 0 || plotHeight <= 0) return;

      const domain = analysis.domain;
      const toPixelX = (x: number) => PADDING.left + ((x + domain) / (2 * domain)) * plotWidth;
      const toPixelY = (y: number) => PADDING.top + ((domain - y) / (2 * domain)) * plotHeight;

      ctx.fillStyle = "#09090b";
      ctx.fillRect(PADDING.left, PADDING.top, plotWidth, plotHeight);

      if (grid) {
        const cellW = plotWidth / GRID_RESOLUTION;
        const cellH = plotHeight / GRID_RESOLUTION;
        const span = analysis.zMax - analysis.zMin || 1;
        for (let row = 0; row < GRID_RESOLUTION; row += 1) {
          for (let column = 0; column < GRID_RESOLUTION; column += 1) {
            const z = grid[row * GRID_RESOLUTION + column];
            if (!Number.isFinite(z)) {
              ctx.fillStyle = `rgb(${COLORS.undefined.r}, ${COLORS.undefined.g}, ${COLORS.undefined.b})`;
            } else {
              const t = Math.max(0, Math.min(1, (z - analysis.zMin) / span));
              ctx.fillStyle = `rgb(${Math.round(lerp(COLORS.low.r, COLORS.high.r, t))}, ${Math.round(
                lerp(COLORS.low.g, COLORS.high.g, t),
              )}, ${Math.round(lerp(COLORS.low.b, COLORS.high.b, t))})`;
            }
            ctx.fillRect(
              PADDING.left + column * cellW,
              PADDING.top + row * cellH,
              cellW + 0.5,
              cellH + 0.5,
            );
          }
        }
      }

      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(toPixelX(-domain), toPixelY(0));
      ctx.lineTo(toPixelX(domain), toPixelY(0));
      ctx.moveTo(toPixelX(0), toPixelY(-domain));
      ctx.lineTo(toPixelX(0), toPixelY(domain));
      ctx.stroke();

      ctx.fillStyle = COLORS.axisText;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`−${formatTick(domain)}`, toPixelX(-domain), PADDING.top + plotHeight + 8);
      ctx.fillText(formatTick(domain), toPixelX(domain), PADDING.top + plotHeight + 8);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTick(domain), PADDING.left - 8, toPixelY(domain));
      ctx.fillText(`−${formatTick(domain)}`, PADDING.left - 8, toPixelY(-domain));

      if (analysis.points.length > 1) {
        ctx.beginPath();
        analysis.points.forEach((point, index) => {
          const x = toPixelX(point.x);
          const y = toPixelY(point.y);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = COLORS.spiral;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      if (cursor) {
        const x = toPixelX(cursor.x);
        const y = toPixelY(cursor.y);
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.cursor;
        ctx.fill();
        ctx.strokeStyle = "#09090b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [analysis, cursor, grid]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-hidden="true"
      className="h-full w-full"
    />
  );
}
