"use client";

import { useMemo } from "react";
import { RATED_POWER_KW, type HistorySeries } from "@/services/aceApi";

const W = 1000;
const H = 200;

/** Rolling 24 h power output as a simple area chart. */
export default function PowerTrend({ history }: { history: HistorySeries | null }) {
  const paths = useMemo(() => {
    const pts = history?.points ?? [];
    if (pts.length < 2) return null;
    const t0 = pts[0].t;
    const span = Math.max(1, pts[pts.length - 1].t - t0);
    const x = (t: number) => ((t - t0) / span) * W;
    const y = (kw: number) => H - Math.min(1, kw / RATED_POWER_KW) * (H - 8);

    let line = "";
    let area = "";
    let segmentStart: number | null = null;
    let lastX = 0;
    for (const p of pts) {
      if (p.powerKw === null) {
        if (segmentStart !== null) area += `L${lastX},${H}L${segmentStart},${H}Z`;
        segmentStart = null;
        continue;
      }
      const px = x(p.t);
      const py = y(p.powerKw);
      if (segmentStart === null) {
        segmentStart = px;
        line += `M${px},${py}`;
        area += `M${px},${py}`;
      } else {
        line += `L${px},${py}`;
        area += `L${px},${py}`;
      }
      lastX = px;
    }
    if (segmentStart !== null) area += `L${lastX},${H}L${segmentStart},${H}Z`;
    return { line, area };
  }, [history]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1" aria-hidden>
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="white" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        {paths && (
          <>
            <path d={paths.area} fill="url(#trendFill)" />
            <path d={paths.line} fill="none" stroke="#6ee7b7" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[clamp(0.8rem,1.6vh,1.2rem)] text-white/55">
        <span>24 hours ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
