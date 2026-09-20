"use client";

import { useEffect, useRef } from "react";

import type { CriticalKind, FunctionAnalysis } from "@/lib/math/analyze";

const COLORS = {
  grid: "#27272a",
  axis: "#52525b",
  axisText: "#71717a",
  curve: "#22d3ee",
  cursor: "#fafafa",
  max: "#d946ef",
  min: "#34d399",
  inflection: "#fcd34d",
  discontinuity: "#fb7185",
} as const;

export const CRITICAL_COLORS: Record<CriticalKind, string> = {
  max: COLORS.max,
  min: COLORS.min,
  inflection: COLORS.inflection,
};

export const DISCONTINUITY_COLOR = COLORS.discontinuity;

const PADDING = { top: 24, right: 24, bottom: 34, left: 52 };

function niceStep(span: number): number {
  const rough = span / 8;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const step = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return step * magnitude;
}

function formatTick(value: number, step: number): string {
  const digits = Math.max(0, Math.min(4, -Math.floor(Math.log10(step)) + 1));
  const text = value.toFixed(digits);
  return text.replace(/\.?0+$/, "") || "0";
}

export function FunctionGraph({
  analysis,
  cursorIndex,
}: {
  analysis: FunctionAnalysis;
  cursorIndex: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

      const { xMin, xMax, yMin, yMax, points, criticalPoints, discontinuities } = analysis;
      const toPixelX = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
      const toPixelY = (y: number) =>
        PADDING.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

      // Grid and tick labels.
      const xStep = niceStep(xMax - xMin);
      const yStep = niceStep(yMax - yMin);
      ctx.font = "11px ui-monospace, monospace";
      ctx.lineWidth = 1;

      ctx.strokeStyle = COLORS.grid;
      ctx.fillStyle = COLORS.axisText;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax + 1e-9; x += xStep) {
        const px = toPixelX(x);
        ctx.beginPath();
        ctx.moveTo(px, PADDING.top);
        ctx.lineTo(px, PADDING.top + plotHeight);
        ctx.stroke();
        ctx.fillText(formatTick(x, xStep), px, PADDING.top + plotHeight + 8);
      }

      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax + 1e-9; y += yStep) {
        const py = toPixelY(y);
        ctx.beginPath();
        ctx.moveTo(PADDING.left, py);
        ctx.lineTo(PADDING.left + plotWidth, py);
        ctx.stroke();
        ctx.fillText(formatTick(y, yStep), PADDING.left - 8, py);
      }

      // Axes, only when zero is inside the window.
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1.5;
      if (yMin < 0 && yMax > 0) {
        const py = toPixelY(0);
        ctx.beginPath();
        ctx.moveTo(PADDING.left, py);
        ctx.lineTo(PADDING.left + plotWidth, py);
        ctx.stroke();
      }
      if (xMin < 0 && xMax > 0) {
        const px = toPixelX(0);
        ctx.beginPath();
        ctx.moveTo(px, PADDING.top);
        ctx.lineTo(px, PADDING.top + plotHeight);
        ctx.stroke();
      }

      // The curve. Breaks in the path keep asymptotes from drawing vertical bars.
      ctx.save();
      ctx.beginPath();
      ctx.rect(PADDING.left, PADDING.top, plotWidth, plotHeight);
      ctx.clip();

      ctx.strokeStyle = COLORS.curve;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let penDown = false;
      const jumpLimit = (yMax - yMin) * 0.4;
      for (let i = 0; i < points.length; i += 1) {
        const point = points[i];
        const previous = points[i - 1];
        if (!Number.isFinite(point.y)) {
          penDown = false;
          continue;
        }
        const px = toPixelX(point.x);
        const py = toPixelY(point.y);
        const discontinuous =
          previous && Number.isFinite(previous.y) && Math.abs(point.y - previous.y) > jumpLimit;
        if (!penDown || discontinuous) {
          ctx.moveTo(px, py);
          penDown = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();

      // Discontinuities: dashed verticals where the curve breaks.
      ctx.strokeStyle = COLORS.discontinuity;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.globalAlpha = 0.75;
      for (const gap of discontinuities) {
        const px = toPixelX(gap.x);
        ctx.beginPath();
        ctx.moveTo(px, PADDING.top);
        ctx.lineTo(px, PADDING.top + plotHeight);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Critical points.
      for (const critical of criticalPoints) {
        if (critical.y < yMin || critical.y > yMax) continue;
        const px = toPixelX(critical.x);
        const py = toPixelY(critical.y);
        const color = CRITICAL_COLORS[critical.kind];
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#09090b";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Cursor: a full height guide plus a bright dot on the curve.
      const cursor = points[cursorIndex];
      if (cursor) {
        const px = toPixelX(cursor.x);
        ctx.strokeStyle = COLORS.cursor;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, PADDING.top);
        ctx.lineTo(px, PADDING.top + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        if (Number.isFinite(cursor.y)) {
          const py = toPixelY(cursor.y);
          ctx.fillStyle = COLORS.cursor;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#09090b";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [analysis, cursorIndex]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
