"use client";

/** Building blocks shared by the "Last hours" and "Statistics" tabs. */

import type { ReactNode } from "react";

/** Single row of preset buttons above the charts (they scope everything below). */
export function RangePicker<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-xl px-[1.6vh] py-[0.7vh] text-[clamp(0.85rem,1.8vh,1.3rem)] font-semibold transition-colors ${
              active ? "bg-emerald-400 text-slate-950" : "text-white/75 hover:bg-white/10"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Headline number for the selected period. */
export function StatTile({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] px-[1.6vh] py-[1.1vh] ring-1 ring-white/10">
      <div className="text-[clamp(0.7rem,1.5vh,1.1rem)] font-semibold uppercase tracking-wide text-white/60">{label}</div>
      <div className="text-[clamp(1.4rem,3.6vh,2.8rem)] font-extrabold leading-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[0.5em] font-bold text-white/60">{unit}</span>}
      </div>
      {sub && <div className="truncate text-[clamp(0.7rem,1.4vh,1.05rem)] text-white/55">{sub}</div>}
    </div>
  );
}

/** Tab frame: controls row, stat tiles, then the chart grid (dimmed while refetching). */
export function AnalyticsFrame({
  controls,
  note,
  tiles,
  children,
  status,
}: {
  controls: ReactNode;
  note?: ReactNode;
  tiles: ReactNode;
  children: ReactNode;
  status: "loading" | "error" | "refreshing" | "ready";
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-[1.4vh] p-[1.8vh]">
      <div className="flex flex-wrap items-center gap-x-[2vh] gap-y-2">
        {controls}
        {note && <div className="text-[clamp(0.75rem,1.6vh,1.15rem)] text-white/55">{note}</div>}
        {status === "error" && (
          <div className="rounded-full bg-amber-500/20 px-3 py-1 text-[clamp(0.75rem,1.6vh,1.15rem)] ring-1 ring-amber-400/40">
            Couldn&apos;t reach the turbine data — showing what we have
          </div>
        )}
      </div>
      {status === "loading" ? (
        <div className="grid flex-1 place-items-center text-[clamp(1rem,2.4vh,1.8rem)] font-semibold text-white/60">Loading turbine data…</div>
      ) : (
        <div className={`flex min-h-0 flex-1 flex-col gap-[1.4vh] transition-opacity ${status === "refreshing" ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-[1.2vh] md:grid-cols-5">{tiles}</div>
          {children}
        </div>
      )}
    </div>
  );
}
