"use client";

/**
 * Community figures as floating "signs" around the 3D turbine, each tied to a point on it by a
 * leader line (see turbine/Callouts). Shared by the phone layout and the desktop / kiosk screen;
 * the desktop version uses larger cards and adds the 24-hour power chart.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Car,
  Coffee,
  HandCoins,
  House,
  Leaf,
  Lightbulb,
  RotateCw,
  Smartphone,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import PowerTrend from "@/components/PowerTrend";
import type { CalloutSpec } from "@/components/turbine/Callouts";
import type { HistorySeries, LiveSnapshot } from "@/services/aceApi";
import { UK_HOUSEHOLD_KWH_PER_YEAR, compassPoint, describeWind, type CommunityMetrics } from "@/utils/metrics";

/** True on the desktop / kiosk screen: larger signs. */
const WideSigns = createContext(false);

/* ------------------------------------------------------------------ */
/* A floating sign                                                     */
/* ------------------------------------------------------------------ */

export function Sign({
  icon: Icon,
  accent,
  label,
  children,
  sub,
}: {
  icon: LucideIcon;
  accent: string;
  label: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  const wide = useContext(WideSigns);
  if (wide) {
    return (
      <div className="rounded-2xl bg-slate-950/55 px-[1.8vh] py-[1.3vh] shadow-xl shadow-black/30 ring-1 ring-white/15 backdrop-blur-sm">
        <div className="flex items-center gap-[1vh] text-[clamp(0.75rem,1.7vh,1.35rem)] font-semibold uppercase tracking-wide text-white/75">
          <span className={`grid size-[3.2vh] shrink-0 place-items-center rounded-lg ${accent}`}>
            <Icon className="size-[2.1vh]" strokeWidth={2.6} />
          </span>
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-[0.6vh] text-[clamp(1.8rem,5.6vh,4.6rem)] font-extrabold leading-none tracking-tight tabular-nums">{children}</div>
        {sub && <div className="mt-[0.6vh] line-clamp-2 text-[clamp(0.75rem,1.7vh,1.35rem)] leading-snug text-white/70">{sub}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-slate-950/55 px-2 py-1.5 shadow-lg shadow-black/30 ring-1 ring-white/15 backdrop-blur-sm">
      <div className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-wide text-white/75">
        <span className={`grid size-4 shrink-0 place-items-center rounded ${accent}`}>
          <Icon className="size-3" strokeWidth={2.6} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-[1.3rem] font-extrabold leading-none tracking-tight tabular-nums">{children}</div>
      {sub && <div className="mt-0.5 line-clamp-2 text-[0.62rem] leading-tight text-white/70">{sub}</div>}
    </div>
  );
}

export const Unit = ({ children }: { children: ReactNode }) => (
  <span className="ml-0.5 text-[0.55em] font-bold text-white/70">{children}</span>
);

/** Bottom-right sign: cycles through lifetime energy / community fund and everyday equivalents. */
export function CyclingSign({ metrics, ready }: { metrics: CommunityMetrics; ready: boolean }) {
  const items = useMemo(() => {
    const list: Array<{ key: string; icon: LucideIcon; accent: string; label: string; value: ReactNode; sub: string }> = [];
    if (metrics.fundGbpPerHour !== null) {
      list.push({
        key: "fund",
        icon: HandCoins,
        accent: "bg-pink-400 text-slate-950",
        label: "For Lawrence Weston",
        value: (
          <>
            <AnimatedNumber value={metrics.fundGbpPerHour} decimals={2} prefix="£" />
            <Unit>/h</Unit>
          </>
        ),
        sub: "estimated community fund",
      });
    } else if (metrics.lifetimeMwh !== null) {
      list.push({
        key: "lifetime",
        icon: Zap,
        accent: "bg-pink-400 text-slate-950",
        label: "Since switch-on",
        value: (
          <>
            <AnimatedNumber value={metrics.lifetimeMwh / 1000} decimals={2} />
            <Unit>GWh</Unit>
          </>
        ),
        sub: `≈ ${Math.round((metrics.lifetimeMwh * 1000) / UK_HOUSEHOLD_KWH_PER_YEAR).toLocaleString("en-GB")} homes for a year`,
      });
    }
    const icons = { kettles: Coffee, ev: Car, phones: Smartphone, bulbs: Lightbulb };
    for (const e of metrics.equivalents) {
      list.push({
        key: e.id,
        icon: icons[e.id],
        accent: "bg-violet-300 text-slate-950",
        label: "Enough power for",
        value: <AnimatedNumber value={e.value} />,
        sub: e.label,
      });
    }
    return list;
  }, [metrics]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => i + 1), 6_000);
    return () => clearInterval(id);
  }, []);
  const item = items[index % Math.max(1, items.length)];
  if (!item) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={item.key}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35 }}
      >
        <Sign icon={item.icon} accent={item.accent} label={item.label} sub={item.sub}>
          {ready ? item.value : "—"}
        </Sign>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * The six signs around the turbine: power (+ 24 h chart when wide), wind, homes powered, rotor,
 * CO2 avoided and a sign cycling through lifetime / community-fund figures and equivalents.
 */
export function buildCallouts({
  live,
  metrics,
  history = null,
  wide = false,
}: {
  live: LiveSnapshot | null;
  metrics: CommunityMetrics;
  history?: HistorySeries | null;
  wide?: boolean;
}): CalloutSpec[] {
  const ready = live !== null;
  const windSpeed = live?.windSpeedMs ?? 0;
  const rpm = live?.rotorSpeedRpm ?? 0;
  const windDirection = live?.windDirectionDeg ?? 225;
  const wind = compassPoint(windDirection);
  const dash = "—";
  const pct = Math.round(metrics.capacityShare * 100);

  const callouts: CalloutSpec[] = [
    {
      id: "power",
      slot: "tl",
      anchor: "hub",
      content: (
        <Sign
          icon={Zap}
          accent="bg-emerald-400 text-slate-950"
          label="Power now"
          sub={
            <>
              <span className="mb-1 block h-1.5 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 transition-[width] duration-1000"
                  style={{ width: `${pct}%` }}
                />
              </span>
              {ready ? `${pct}% of 4.2 MW` : "max 4.2 MW"}
              {metrics.energy24hKwh !== null && ` · ${(metrics.energy24hKwh / 1000).toFixed(1)} MWh in 24 h`}
              {wide && (
                <span className="mt-[1vh] block h-[11vh]">
                  <PowerTrend history={history} />
                </span>
              )}
            </>
          }
        >
          {ready ? (
            <>
              <AnimatedNumber value={metrics.powerKw / 1000} decimals={2} />
              <Unit>MW</Unit>
            </>
          ) : (
            dash
          )}
        </Sign>
      ),
    },
    {
      id: "wind",
      slot: "tr",
      anchor: "rotorTop",
      content: (
        <Sign
          icon={Wind}
          accent="bg-sky-400 text-slate-950"
          label="Wind"
          sub={ready ? `${describeWind(windSpeed)} · from the ${wind.long}` : dash}
        >
          {ready ? (
            <span className="inline-flex items-center gap-1">
              <AnimatedNumber value={windSpeed} decimals={1} />
              <Unit>m/s</Unit>
              <motion.span
                className="ml-1 inline-grid"
                animate={{ rotate: windDirection + 180 }}
                transition={{ type: "spring", stiffness: 30, damping: 12 }}
              >
                <ArrowUp className="size-[0.8em]" strokeWidth={3} />
              </motion.span>
            </span>
          ) : (
            dash
          )}
        </Sign>
      ),
    },
    {
      id: "homes",
      slot: "ml",
      anchor: "towerUpper",
      content: (
        <Sign icon={House} accent="bg-amber-400 text-slate-950" label="Homes powered" sub="average UK homes, right now">
          {ready ? <AnimatedNumber value={metrics.homesPowered} /> : dash}
        </Sign>
      ),
    },
    {
      id: "rotor",
      slot: "mr",
      anchor: "nacelle",
      content: (
        <Sign
          icon={RotateCw}
          accent="bg-cyan-300 text-slate-950"
          label="Rotor"
          sub={ready ? (rpm > 0.2 ? `one turn every ${(60 / rpm).toFixed(1)} s` : "blades at rest") : dash}
        >
          {ready ? (
            <>
              <AnimatedNumber value={rpm} decimals={1} />
              <Unit>rpm</Unit>
            </>
          ) : (
            dash
          )}
        </Sign>
      ),
    },
    {
      id: "co2",
      slot: "bl",
      anchor: "towerLow",
      content: (
        <Sign
          icon={Leaf}
          accent="bg-lime-400 text-slate-950"
          label="CO₂ avoided"
          sub={metrics.co2Tonnes24h !== null ? `${metrics.co2Tonnes24h.toFixed(1)} t in the last 24 h` : "vs UK grid average"}
        >
          {ready ? (
            <>
              <AnimatedNumber value={metrics.co2KgPerHour} />
              <Unit>kg/h</Unit>
            </>
          ) : (
            dash
          )}
        </Sign>
      ),
    },
    { id: "cycle", slot: "br", anchor: "base", content: <CyclingSign metrics={metrics} ready={ready} /> },
  ];

  return callouts.map((c) => ({ ...c, content: <WideSigns.Provider value={wide}>{c.content}</WideSigns.Provider> }));
}
