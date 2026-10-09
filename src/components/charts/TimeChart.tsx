"use client";

/**
 * Time-series chart (SVG, one y-axis): 2 px lines, optional min–max band per series, recessive
 * grid, and a crosshair that snaps to the nearest sample. The hover time is shared through
 * `hoverT` / `onHover`, so every chart in a tab shows the same instant.
 */

import { useMemo } from "react";
import { axisTime, formatNumber, nearestIndex, niceTicks, tooltipTime, useSize } from "./chartUtils";

export interface TimeSeriesSpec {
  name: string;
  color: string;
  values: Array<number | null>;
  /** Optional min–max envelope drawn as a translucent band behind the line. */
  band?: { min: Array<number | null>; max: Array<number | null> };
}

interface Props {
  title: string;
  unit: string;
  digits?: number;
  t: number[];
  series: TimeSeriesSpec[];
  resolutionSeconds: number;
  /** Fixed y range (else fitted to the data, from 0 when `zeroBased`). */
  yDomain?: [number, number];
  zeroBased?: boolean;
  /** Use exact y ticks (e.g. compass degrees). */
  yTicks?: number[];
  yTickLabel?: (v: number) => string;
  hoverT: number | null;
  onHover: (t: number | null) => void;
  className?: string;
}

const PAD = { top: 10, right: 14, bottom: 26, left: 52 };

/** Path for one series; dense data is reduced to a min/max pair per pixel column. */
function linePath(t: number[], v: Array<number | null>, x: (t: number) => number, y: (v: number) => number, width: number) {
  const n = t.length;
  let d = "";
  if (n > width * 3) {
    let col = -1;
    let lo = Infinity;
    let hi = -Infinity;
    let pen = false;
    const flush = () => {
      if (col < 0 || lo === Infinity) return;
      d += `${pen ? "L" : "M"}${col},${y(lo).toFixed(1)}L${col},${y(hi).toFixed(1)}`;
      pen = true;
    };
    for (let i = 0; i < n; i++) {
      const value = v[i];
      const c = Math.round(x(t[i]));
      if (c !== col) {
        flush();
        col = c;
        lo = Infinity;
        hi = -Infinity;
      }
      if (value === null) {
        flush();
        lo = Infinity;
        hi = -Infinity;
        pen = false;
        continue;
      }
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
    flush();
    return d;
  }
  let pen = false;
  for (let i = 0; i < n; i++) {
    const value = v[i];
    if (value === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(t[i]).toFixed(1)},${y(value).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Closed area between two series (gaps break the band). */
function bandPath(t: number[], lo: Array<number | null>, hi: Array<number | null>, x: (t: number) => number, y: (v: number) => number, width: number) {
  const step = Math.max(1, Math.floor(t.length / (width * 2)));
  let d = "";
  let top: string[] = [];
  let bottom: string[] = [];
  const close = () => {
    if (top.length > 1) d += `M${top.join("L")}L${bottom.reverse().join("L")}Z`;
    top = [];
    bottom = [];
  };
  for (let i = 0; i < t.length; i += step) {
    // Over each step keep the extreme values so short peaks survive the thinning.
    let a = Infinity;
    let b = -Infinity;
    for (let k = i; k < Math.min(t.length, i + step); k++) {
      if (lo[k] !== null) a = Math.min(a, lo[k] as number);
      if (hi[k] !== null) b = Math.max(b, hi[k] as number);
    }
    if (a === Infinity || b === -Infinity) {
      close();
      continue;
    }
    const px = x(t[i]).toFixed(1);
    top.push(`${px},${y(b).toFixed(1)}`);
    bottom.push(`${px},${y(a).toFixed(1)}`);
  }
  close();
  return d;
}

export default function TimeChart({
  title,
  unit,
  digits = 0,
  t,
  series,
  resolutionSeconds,
  yDomain,
  zeroBased = false,
  yTicks: fixedTicks,
  yTickLabel,
  hoverT,
  onHover,
  className = "",
}: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const W = size.width;
  const H = size.height;
  const innerW = Math.max(1, W - PAD.left - PAD.right);
  const innerH = Math.max(1, H - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    if (t.length < 2 || W < 10) return null;
    const t0 = t[0];
    const t1 = t[t.length - 1];
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      for (const arr of [s.values, s.band?.min, s.band?.max]) {
        if (!arr) continue;
        for (const v of arr) {
          if (v === null) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (lo === Infinity) return null;
    if (zeroBased) lo = Math.min(0, lo);
    const ticks = fixedTicks ?? niceTicks(lo, hi, 4);
    const [d0, d1] = yDomain ?? [Math.min(lo, ticks[0]), Math.max(hi, ticks[ticks.length - 1])];
    const x = (v: number) => PAD.left + ((v - t0) / (t1 - t0 || 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - d0) / (d1 - d0 || 1)) * innerH;
    const xTicks: number[] = [];
    for (let k = 0; k <= 4; k++) xTicks.push(t0 + ((t1 - t0) * k) / 4);
    return {
      t0,
      t1,
      x,
      y,
      yTicks: ticks.filter((v) => v >= d0 - 1e-9 && v <= d1 + 1e-9),
      xTicks,
      paths: series.map((s) => ({
        line: linePath(t, s.values, x, y, innerW),
        band: s.band ? bandPath(t, s.band.min, s.band.max, x, y, innerW) : null,
      })),
    };
  }, [t, series, W, innerW, innerH, yDomain, zeroBased, fixedTicks]);

  const hover = useMemo(() => {
    if (!model || hoverT === null || hoverT < model.t0 || hoverT > model.t1) return null;
    const i = nearestIndex(t, hoverT);
    return { i, px: model.x(t[i]) };
  }, [model, hoverT, t]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD.left || px > W - PAD.right) return onHover(null);
    onHover(model.t0 + ((px - PAD.left) / innerW) * (model.t1 - model.t0));
  };

  const span = model ? model.t1 - model.t0 : 0;
  // Enough decimals to tell neighbouring ticks apart (e.g. 49.9 / 50.0 / 50.1 Hz).
  const tickStep = model && model.yTicks.length > 1 ? Math.abs(model.yTicks[1] - model.yTicks[0]) : 1;
  const tickDigits = Math.max(0, Math.min(3, -Math.floor(Math.log10(tickStep) + 1e-9)));
  const label = yTickLabel ?? ((v: number) => formatNumber(v, tickDigits));

  return (
    <figure className={`flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-[1.4vh] ring-1 ring-white/10 ${className}`}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[clamp(0.85rem,1.8vh,1.35rem)] font-semibold text-white/85">
          {title} <span className="font-normal text-white/50">({unit})</span>
        </span>
        {series.length > 1 && (
          <span className="flex gap-3 text-[clamp(0.7rem,1.5vh,1.1rem)] text-white/65">
            {series.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div ref={ref} className="relative mt-[0.6vh] min-h-0 flex-1">
        {model && (
          <svg
            width={W}
            height={H}
            className="absolute inset-0 touch-none select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => onHover(null)}
            role="img"
            aria-label={`${title} over time`}
          >
            {model.yTicks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={W - PAD.right} y1={model.y(v)} y2={model.y(v)} stroke="white" strokeOpacity={0.08} />
                <text x={PAD.left - 8} y={model.y(v)} dy="0.32em" textAnchor="end" className="fill-white/50 text-[11px] tabular-nums">
                  {label(v)}
                </text>
              </g>
            ))}
            {model.xTicks.map((v, k) => (
              <text
                key={k}
                x={model.x(v)}
                y={H - 6}
                textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}
                className="fill-white/50 text-[11px] tabular-nums"
              >
                {axisTime(v, span)}
              </text>
            ))}
            {series.map((s, k) =>
              model.paths[k].band ? <path key={`b${k}`} d={model.paths[k].band!} fill={s.color} fillOpacity={0.22} /> : null,
            )}
            {series.map((s, k) => (
              <path key={`l${k}`} d={model.paths[k].line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {hover && (
              <g pointerEvents="none">
                <line x1={hover.px} x2={hover.px} y1={PAD.top} y2={PAD.top + innerH} stroke="white" strokeOpacity={0.45} />
                {series.map((s) => {
                  const v = s.values[hover.i];
                  return v === null ? null : (
                    <circle key={s.name} cx={hover.px} cy={model.y(v)} r={4} fill={s.color} stroke="#0f172a" strokeWidth={2} />
                  );
                })}
              </g>
            )}
          </svg>
        )}
        {hover && model && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[8rem] rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-[clamp(0.7rem,1.4vh,1rem)] shadow-lg ring-1 ring-white/15"
            style={hover.px > W / 2 ? { right: W - hover.px + 10 } : { left: hover.px + 10 }}
          >
            <div className="text-white/55">{tooltipTime(t[hover.i], span, resolutionSeconds)}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-white/65">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-bold tabular-nums text-white">
                  {formatNumber(s.values[hover.i], digits)}
                  <span className="ml-0.5 font-normal text-white/55">{unit.startsWith("°") ? "°" : ` ${unit}`}</span>
                  {s.band && s.band.min[hover.i] !== null && (
                    <span className="ml-1 font-normal text-white/55">
                      ({formatNumber(s.band.min[hover.i], digits)}–{formatNumber(s.band.max[hover.i], digits)})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {!model && <div className="absolute inset-0 grid place-items-center text-white/40">No data for this period</div>}
      </div>
    </figure>
  );
}
