"use client";

/**
 * Phone layout: the live 3D turbine fills the screen and the community data float around it
 * as signs connected to the turbine by leader lines. Tapping the turbine still opens the
 * explorer (the info panel becomes a bottom sheet and the signs step aside).
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
  RefreshCw,
  RotateCw,
  Smartphone,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import MessageTicker from "@/components/MessageTicker";
import SafeBoundary from "@/components/SafeBoundary";
import type { CalloutSpec } from "@/components/turbine/Callouts";
import type { LiveSnapshot, TurbineStatus } from "@/services/aceApi";
import { UK_HOUSEHOLD_KWH_PER_YEAR, compassPoint, describeWind, type CommunityMetrics } from "@/utils/metrics";
import { formatUkDate, formatUkTime } from "@/utils/sun";

const Turbine3D = dynamic(() => import("@/components/Turbine3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-slate-900 text-lg font-semibold text-white/70">
      Loading the 3D turbine…
    </div>
  ),
});

export interface MobileKioskProps {
  now: Date | null;
  live: LiveSnapshot | null;
  metrics: CommunityMetrics;
  status: TurbineStatus;
  statusStyle: { text: string; dot: string; pill: string };
  connecting: boolean;
  reconnecting: boolean;
  lastUpdated: number | null;
}

/* ------------------------------------------------------------------ */
/* A floating sign                                                     */
/* ------------------------------------------------------------------ */

function Sign({
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

const Unit = ({ children }: { children: ReactNode }) => (
  <span className="ml-0.5 text-[0.55em] font-bold text-white/70">{children}</span>
);

/** Bottom-right sign: cycles through lifetime energy / community fund and everyday equivalents. */
function CyclingSign({ metrics, ready }: { metrics: CommunityMetrics; ready: boolean }) {
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

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export default function MobileKiosk({
  now,
  live,
  metrics,
  status,
  statusStyle,
  connecting,
  reconnecting,
  lastUpdated,
}: MobileKioskProps) {
  const [exploring, setExploring] = useState(false);
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
                <ArrowUp className="size-5" strokeWidth={3} />
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

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      <SafeBoundary
        name="Turbine3D"
        fallback={<div className="absolute inset-0 grid place-items-center text-lg text-white/70">Restarting the 3D turbine…</div>}
        retryAfterMs={20_000}
      >
        <Turbine3D
          className="absolute inset-0"
          compact
          callouts={callouts}
          rotorSpeedRpm={rpm}
          nacelleYawDeg={live?.nacelleYawDeg ?? windDirection}
          windDirectionDeg={windDirection}
          windSpeedMs={windSpeed}
          status={status}
          hasData={ready}
          onExploringChange={setExploring}
        />
      </SafeBoundary>

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-slate-950/85 via-slate-950/50 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-start gap-2.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-slate-950">
            <Wind className="size-6" strokeWidth={2.6} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[0.98rem] font-extrabold leading-tight">Lawrence Weston Community Wind Turbine</h1>
            <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ${statusStyle.pill}`}>
              <span className="relative flex size-2">
                {status === "Generating" && (
                  <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-70 ${statusStyle.dot}`} />
                )}
                <span className={`relative inline-flex size-full rounded-full ${statusStyle.dot}`} />
              </span>
              {ready ? statusStyle.text : "Connecting…"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold leading-none tabular-nums">{now ? formatUkTime(now) : "--:--"}</div>
            <div className="mt-0.5 text-[0.62rem] text-white/60">{now ? formatUkDate(now) : ""}</div>
          </div>
        </div>
        {live?.scadaStale && (
          <div className="mt-2 inline-block rounded-full bg-amber-500/25 px-2 py-0.5 text-[0.68rem] ring-1 ring-amber-400/40">
            Latest turbine reading from {formatUkTime(new Date(live.observedAt))}
          </div>
        )}
      </header>

      {connecting && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-lg font-semibold text-white/80">
          Connecting to the ACE turbine…
        </div>
      )}

      {/* Footer: community messages + attribution (hidden while the bottom sheet is open) */}
      <footer
        className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/50 to-transparent px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-6 transition-opacity duration-500 ${
          exploring ? "opacity-0" : "opacity-100"
        }`}
      >
        <MessageTicker compact />
        <p className="mt-1.5 text-center text-[0.6rem] text-white/50">
          Live data: Ambition Community Energy (CC-BY-4.0) · DOI 10.5281/zenodo.22662372
        </p>
      </footer>

      <AnimatePresence>
        {reconnecting && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-1/2 top-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-slate-950/85 px-3 py-1.5 text-xs ring-1 ring-amber-400/40 backdrop-blur"
          >
            <RefreshCw className="size-3.5 animate-spin text-amber-300" />
            Reconnecting…
            {lastUpdated && <span className="text-white/55">last {formatUkTime(new Date(lastUpdated))}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
