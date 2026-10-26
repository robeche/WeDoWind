"use client";

/**
 * Scatter plot drawn on a canvas (thousands of 10-minute points), with SVG axes and a
 * nearest-point hover readout (the pointer only has to be closest, within 24 px).
 * Zoom by window: drag a rectangle over the points and release to zoom into it; double-click resets.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ChartFrame from "./ChartFrame";
import type { ChartExplanation } from "./chartInfo";
import { formatNumber, niceTicks, useSize } from "./chartUtils";
import { rangeFromPixels, SelectionRect, useZoomWindow } from "./useZoomGestures";

type Range = [number, number];

interface Props {
  title: string;
  xLabel: string;
  yLabel: string;
  x: Array<number | null>;
  y: Array<number | null>;
  color: string;
  xDigits?: number;
  yDigits?: number;
  /** Optional extra line in the tooltip for point i (e.g. its date). */
  describe?: (i: number) => string;
  /** Optional reference line drawn over the points (e.g. the binned median curve). */
  reference?: Array<[number, number]>;
  referenceName?: string;
  info?: ChartExplanation;
  className?: string;
}

const PAD = { top: 10, right: 14, bottom: 34, left: 56 };
const HIT_RADIUS = 24;

export default function ScatterChart({
  title,
  xLabel,
  yLabel,
  x,
  y,
  color,
  xDigits = 1,
  yDigits = 0,
  describe,
  reference,
  referenceName,
  info,
  className = "",
}: Props) {
  const [ref, size, plotEl] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<{ x: Range; y: Range } | null>(null);
  const W = size.width;
  const H = size.height;
  const innerW = Math.max(1, W - PAD.left - PAD.right);
  const innerH = Math.max(1, H - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    let xMax = 0;
    let yMax = 0;
    let count = 0;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === null || y[i] === null) continue;
      xMax = Math.max(xMax, x[i] as number);
      yMax = Math.max(yMax, y[i] as number);
      count++;
    }
    if (!count || W < 10) return null;
    const fullX = niceTicks(0, xMax, 5);
    const fullY = niceTicks(0, yMax, 4);
    const full = { x: [0, fullX[fullX.length - 1]] as Range, y: [0, fullY[fullY.length - 1]] as Range };
    const vx = view?.x ?? full.x;
    const vy = view?.y ?? full.y;
    const inside = (t: number, r: Range) => t >= r[0] - 1e-9 && t <= r[1] + 1e-9;
    const xTicks = view ? niceTicks(vx[0], vx[1], 5).filter((t) => inside(t, vx)) : fullX;
    const yTicks = view ? niceTicks(vy[0], vy[1], 4).filter((t) => inside(t, vy)) : fullY;
    const sx = (v: number) => PAD.left + ((v - vx[0]) / (vx[1] - vx[0])) * innerW;
    const sy = (v: number) => PAD.top + innerH - ((v - vy[0]) / (vy[1] - vy[0])) * innerH;
    // Enough decimals to tell neighbouring ticks apart once zoomed in.
    const digitsFor = (ticks: number[]) =>
      ticks.length > 1 ? Math.max(0, Math.min(3, -Math.floor(Math.log10(Math.abs(ticks[1] - ticks[0])) + 1e-9))) : 0;
    return { xTicks, yTicks, sx, sy, count, full, vx, vy, xTickDigits: digitsFor(xTicks), yTickDigits: digitsFor(yTicks) };
  }, [x, y, W, innerW, innerH, view]);

  const { selection, busyRef } = useZoomWindow(plotEl, {
    axis: "xy",
    bounds: () => (model ? { left: PAD.left, right: PAD.left + innerW, top: PAD.top, bottom: PAD.top + innerH } : null),
    onSelect: (s) => {
      if (!model) return;
      setHover(null);
      const nx = rangeFromPixels(s.x0, s.x1, PAD.left, innerW, model.vx, model.full.x, (model.full.x[1] - model.full.x[0]) / 40);
      // Screen y grows downwards: measure the selection from the bottom of the plot.
      const bottom = PAD.top + innerH;
      const ny = rangeFromPixels(bottom - s.y1 + PAD.top, bottom - s.y0 + PAD.top, PAD.top, innerH, model.vy, model.full.y, (model.full.y[1] - model.full.y[0]) / 40);
      setView(nx || ny ? { x: nx ?? model.full.x, y: ny ?? model.full.y } : null);
    },
    onReset: () => setView(null),
  });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !model) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, innerW, innerH);
    ctx.clip();
    // Dense data: small, translucent dots so overlaps read as density.
    const r = model.count > 3000 ? 1.6 : 2.4;
    ctx.fillStyle = color;
    ctx.globalAlpha = model.count > 3000 ? 0.35 : 0.6;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === null || y[i] === null) continue;
      ctx.beginPath();
      ctx.arc(model.sx(x[i] as number), model.sy(y[i] as number), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, [model, x, y, color, W, H, innerW, innerH]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!model || busyRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < PAD.left || px > PAD.left + innerW || py < PAD.top || py > PAD.top + innerH) return setHover(null);
    let best = -1;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (let i = 0; i < x.length; i++) {
      if (x[i] === null || y[i] === null) continue;
      if ((x[i] as number) < model.vx[0] || (x[i] as number) > model.vx[1] || (y[i] as number) < model.vy[0] || (y[i] as number) > model.vy[1]) continue;
      const dx = model.sx(x[i] as number) - px;
      const dy = model.sy(y[i] as number) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best >= 0 ? best : null);
  };

  const clipId = `clip-${useId().replace(/:/g, "")}`;
  const refPath =
    model && reference?.length
      ? reference.map(([a, b], k) => `${k ? "L" : "M"}${model.sx(a).toFixed(1)},${model.sy(b).toFixed(1)}`).join("")
      : null;

  return (
    <ChartFrame
      className={className}
      info={info}
      zoomed={view !== null}
      onResetZoom={() => setView(null)}
      title={title}
      legend={
        refPath && referenceName ? (
          <>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: color }} />
              10-minute means
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded bg-white" />
              {referenceName}
            </span>
          </>
        ) : undefined
      }
    >
      <div ref={ref} className="relative min-h-0 flex-1 touch-none">
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width: W, height: H }} />
        {model && (
          <svg
            width={W}
            height={H}
            className="absolute inset-0 touch-none select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`${title}: ${yLabel} against ${xLabel}`}
          >
            {model.yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={PAD.left} x2={W - PAD.right} y1={model.sy(v)} y2={model.sy(v)} stroke="white" strokeOpacity={0.08} />
                <text x={PAD.left - 8} y={model.sy(v)} dy="0.32em" textAnchor="end" className="fill-white/50 text-[11px] tabular-nums">
                  {formatNumber(v, model.yTickDigits)}
                </text>
              </g>
            ))}
            {model.xTicks.map((v) => (
              <text key={`x${v}`} x={model.sx(v)} y={PAD.top + innerH + 16} textAnchor="middle" className="fill-white/50 text-[11px] tabular-nums">
                {formatNumber(v, model.xTickDigits)}
              </text>
            ))}
            <text x={PAD.left + innerW / 2} y={H - 2} textAnchor="middle" className="fill-white/55 text-[11px]">
              {xLabel}
            </text>
            <text transform={`translate(12 ${PAD.top + innerH / 2}) rotate(-90)`} textAnchor="middle" className="fill-white/55 text-[11px]">
              {yLabel}
            </text>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
            </clipPath>
            {refPath && <path d={refPath} clipPath={`url(#${clipId})`} fill="none" stroke="#ffffff" strokeWidth={2} strokeOpacity={0.9} />}
            <SelectionRect s={selection} />
            {hover !== null && !selection && (
              <circle cx={model.sx(x[hover] as number)} cy={model.sy(y[hover] as number)} r={5} fill={color} stroke="#ffffff" strokeWidth={2} />
            )}
          </svg>
        )}
        {hover !== null && model && !selection && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-[clamp(0.7rem,1.4vh,1rem)] shadow-lg ring-1 ring-white/15"
            style={{
              left: Math.min(model.sx(x[hover] as number) + 12, W - 170),
              top: Math.max(0, model.sy(y[hover] as number) - 56),
            }}
          >
            {describe && <div className="text-white/55">{describe(hover)}</div>}
            <div className="font-bold tabular-nums text-white">
              {formatNumber(y[hover], yDigits)} <span className="font-normal text-white/55">{yLabel}</span>
            </div>
            <div className="font-bold tabular-nums text-white">
              {formatNumber(x[hover], xDigits)} <span className="font-normal text-white/55">{xLabel}</span>
            </div>
          </div>
        )}
        {!model && <div className="absolute inset-0 grid place-items-center text-white/40">No data for this period</div>}
      </div>
    </ChartFrame>
  );
}
