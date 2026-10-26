"use client";

/**
 * Vertical bar chart (SVG): rounded data-ends on the baseline, per-bar hover readout.
 * Zoom by window: drag across a run of bars and release to zoom into it; double-click resets.
 * The y-axis refits to the visible bars.
 */

import { useId, useMemo, useState } from "react";
import ChartFrame from "./ChartFrame";
import type { ChartExplanation } from "./chartInfo";
import { formatNumber, niceTicks, useSize } from "./chartUtils";
import { rangeFromPixels, SelectionRect, useZoomWindow } from "./useZoomGestures";

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Extra tooltip line. */
  note?: string;
}

interface Props {
  title: string;
  unit: string;
  bars: Bar[];
  color: string;
  digits?: number;
  info?: ChartExplanation;
  className?: string;
}

const PAD = { top: 10, right: 14, bottom: 26, left: 52 };

export default function BarChart({ title, unit, bars, color, digits = 1, info, className = "" }: Props) {
  const [ref, size, plotEl] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  /** Visible bar range in bar units: [first, last + 1). */
  const [view, setView] = useState<[number, number] | null>(null);
  const W = size.width;
  const H = size.height;
  const innerW = Math.max(1, W - PAD.left - PAD.right);
  const innerH = Math.max(1, H - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    if (!bars.length || W < 10) return null;
    const full: [number, number] = [0, bars.length];
    const [a, b] = view && view[1] <= bars.length ? view : full;
    const first = Math.max(0, Math.floor(a));
    const last = Math.min(bars.length - 1, Math.ceil(b) - 1);
    let maxV = 0.001;
    for (let i = first; i <= last; i++) maxV = Math.max(maxV, bars[i].value);
    const ticks = niceTicks(0, maxV, 4);
    const top = ticks[ticks.length - 1];
    const slot = innerW / (b - a);
    const gap = Math.min(2, slot * 0.25); // 2 px surface gap between bars
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const left = (i: number) => PAD.left + (i - a) * slot;
    // Label every n-th bar so labels never collide.
    const every = Math.max(1, Math.ceil((b - a) / Math.max(1, Math.floor(innerW / 64))));
    return { ticks, slot, gap, y, every, left, first, last, a, b, full, zoomed: view !== null && view[1] <= bars.length };
  }, [bars, W, innerW, innerH, view]);

  const { selection, busyRef } = useZoomWindow(plotEl, {
    axis: "x",
    bounds: () => (model ? { left: PAD.left, right: PAD.left + innerW, top: PAD.top, bottom: PAD.top + innerH } : null),
    onSelect: (s) => {
      if (!model) return;
      setHover(null);
      const r = rangeFromPixels(s.x0, s.x1, PAD.left, innerW, [model.a, model.b], model.full, Math.min(3, bars.length));
      // Whole bars only.
      const snapped: [number, number] | null = r ? [Math.max(0, Math.floor(r[0])), Math.min(bars.length, Math.ceil(r[1]))] : null;
      setView(snapped && snapped[1] - snapped[0] < bars.length ? snapped : null);
    },
    onReset: () => setView(null),
  });
  const clipId = `clip-${useId().replace(/:/g, "")}`;

  return (
    <ChartFrame
      className={className}
      info={info}
      zoomed={!!model?.zoomed}
      onResetZoom={() => setView(null)}
      title={
        <>
          {title} <span className="font-normal text-white/50">({unit})</span>
        </>
      }
    >
      <div ref={ref} className="relative min-h-0 flex-1 touch-none">
        {model && (
          <svg width={W} height={H} className="absolute inset-0 select-none" role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
            {model.ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={model.y(v)} y2={model.y(v)} stroke="white" strokeOpacity={0.08} />
                <text x={PAD.left - 8} y={model.y(v)} dy="0.32em" textAnchor="end" className="fill-white/50 text-[11px] tabular-nums">
                  {formatNumber(v, v % 1 ? 1 : 0)}
                </text>
              </g>
            ))}
            <clipPath id={clipId}>
              <rect x={PAD.left} y={0} width={innerW} height={H} />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
            {bars.map((b, i) => {
              if (i < model.first || i > model.last) return null;
              const x0 = model.left(i) + model.gap / 2;
              const w = Math.max(1, model.slot - model.gap);
              const y0 = model.y(b.value);
              const h = PAD.top + innerH - y0;
              const r = Math.min(4, w / 2, h);
              return (
                <g key={b.key}>
                  {/* Rounded top, square on the baseline. */}
                  <path
                    d={`M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + h}Z`}
                    fill={color}
                    fillOpacity={hover === null || hover === i ? 1 : 0.55}
                  />
                  {/* Hit target: the whole column, larger than the bar. */}
                  <rect
                    x={model.left(i)}
                    y={PAD.top}
                    width={model.slot}
                    height={innerH}
                    fill="transparent"
                    onPointerEnter={() => !busyRef.current && setHover(i)}
                    onPointerDown={() => setHover(i)}
                  />
                  {i % model.every === 0 && x0 + w / 2 > PAD.left + 20 && x0 + w / 2 < W - PAD.right - 20 && (
                    <text x={x0 + w / 2} y={H - 6} textAnchor="middle" className="fill-white/50 text-[11px]">
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
            </g>
            <SelectionRect s={selection} />
          </svg>
        )}
        {hover !== null && model && bars[hover] && !selection && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-[clamp(0.7rem,1.4vh,1rem)] shadow-lg ring-1 ring-white/15"
            style={
              model.left(hover + 0.5) > W / 2 ? { right: W - model.left(hover) + 6 } : { left: model.left(hover + 1) + 6 }
            }
          >
            <div className="text-white/55">{bars[hover].label}</div>
            <div className="font-bold tabular-nums text-white">
              {formatNumber(bars[hover].value, digits)} <span className="font-normal text-white/55">{unit}</span>
            </div>
            {bars[hover].note && <div className="text-white/65">{bars[hover].note}</div>}
          </div>
        )}
        {!model && <div className="absolute inset-0 grid place-items-center text-white/40">No data for this period</div>}
      </div>
    </ChartFrame>
  );
}
