/** Shared helpers for the small SVG / canvas charts (dark kiosk theme). */

import { useEffect, useRef, useState } from "react";

/** Categorical slots for the dark surface (validated: CVD ΔE ≥ 9.4, contrast ≥ 3:1 on #0f172a). */
export const SERIES = ["#3987e5", "#d95926", "#199e70"] as const;

/** Measure an element's content box (CSS px) and follow resizes. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min < 1e-9) {
    max = min + 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Index of the timestamp nearest to `t` (array sorted ascending). */
export function nearestIndex(t: number[], value: number): number {
  let lo = 0;
  let hi = t.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < value) lo = mid;
    else hi = mid;
  }
  return Math.abs(t[lo] - value) <= Math.abs(t[hi] - value) ? lo : hi;
}

const UK = "Europe/London";
const fmtTime = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit" });
const fmtTimeSec = new Intl.DateTimeFormat("en-GB", { timeZone: UK, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDay = new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short" });
const fmtDayTime = new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Axis label for a time tick, given the visible span. */
export function axisTime(ms: number, spanMs: number): string {
  return spanMs > 2 * 86_400_000 ? fmtDay.format(ms) : fmtTime.format(ms);
}

/** Tooltip label for a time point. */
export function tooltipTime(ms: number, spanMs: number, resolutionSeconds: number): string {
  if (spanMs > 2 * 86_400_000) return fmtDayTime.format(ms);
  return resolutionSeconds < 60 ? fmtTimeSec.format(ms) : fmtTime.format(ms);
}

export const formatDay = (isoDay: string) => fmtDay.format(new Date(`${isoDay}T12:00:00Z`));

export function formatNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
