"use client";

import { Activity, BarChart3, Box, type LucideIcon } from "lucide-react";

export type KioskTab = "live" | "trends" | "stats";

const TABS: Array<{ id: KioskTab; label: string; short: string; icon: LucideIcon }> = [
  { id: "live", label: "Live 3D twin", short: "Live", icon: Box },
  { id: "trends", label: "Last hours", short: "Hours", icon: Activity },
  { id: "stats", label: "10-min statistics", short: "Stats", icon: BarChart3 },
];

/** The app's three views. */
export default function TabBar({ tab, onChange, compact = false }: { tab: KioskTab; onChange: (t: KioskTab) => void; compact?: boolean }) {
  return (
    <nav role="tablist" aria-label="Views" className="flex gap-1 rounded-2xl bg-white/[0.07] p-1 ring-1 ring-white/10 backdrop-blur">
      {TABS.map(({ id, label, short, icon: Icon }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 rounded-xl font-semibold transition-colors ${
              compact ? "px-2.5 py-1 text-xs" : "px-[1.8vh] py-[0.9vh] text-[clamp(0.9rem,2vh,1.5rem)]"
            } ${active ? "bg-emerald-400 text-slate-950" : "text-white/75 hover:bg-white/10"}`}
          >
            <Icon className={compact ? "size-3.5" : "size-[2.4vh]"} strokeWidth={2.4} />
            {compact ? short : label}
          </button>
        );
      })}
    </nav>
  );
}
