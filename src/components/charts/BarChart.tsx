"use client";

/** Vertical bar chart (SVG): rounded data-ends on the baseline, per-bar hover readout. */

import { useMemo, useState } from "react";
import { formatNumber, niceTicks, useSize } from "./chartUtils";

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
  className?: string;
}

const PAD = { top: 10, right: 14, bottom: 26, left: 52 };

export default function BarChart({ title, unit, bars, color, digits = 1, className = "" }: Props) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = size.width;
  const H = size.height;
  const innerW = Math.max(1, W - PAD.left - PAD.right);
  const innerH = Math.max(1, H - PAD.top - PAD.bottom);

  const model = useMemo(() => {
    if (!bars.length || W < 10) return null;
    const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value), 0.001), 4);
    const top = ticks[ticks.length - 1];
    const slot = innerW / bars.length;
    const gap = Math.min(2, slot * 0.25); // 2 px surface gap between bars
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    // Label every n-th bar so labels never collide.
    const every = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor(innerW / 64))));
    return { ticks, slot, gap, y, every };
  }, [bars, W, innerW, innerH]);

  return (
    <figure className={`flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-[1.4vh] ring-1 ring-white/10 ${className}`}>
      <figcaption className="text-[clamp(0.85rem,1.8vh,1.35rem)] font-semibold text-white/85">
        {title} <span className="font-normal text-white/50">({unit})</span>
      </figcaption>
      <div ref={ref} className="relative mt-[0.6vh] min-h-0 flex-1">
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
            {bars.map((b, i) => {
              const x0 = PAD.left + i * model.slot + model.gap / 2;
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
                    x={PAD.left + i * model.slot}
                    y={PAD.top}
                    width={model.slot}
                    height={innerH}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerDown={() => setHover(i)}
                  />
                  {i % model.every === 0 && (
                    <text x={x0 + w / 2} y={H - 6} textAnchor="middle" className="fill-white/50 text-[11px]">
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && model && bars[hover] && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-[clamp(0.7rem,1.4vh,1rem)] shadow-lg ring-1 ring-white/15"
            style={
              PAD.left + (hover + 0.5) * model.slot > W / 2
                ? { right: W - (PAD.left + hover * model.slot) + 6 }
                : { left: PAD.left + (hover + 1) * model.slot + 6 }
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
    </figure>
  );
}
