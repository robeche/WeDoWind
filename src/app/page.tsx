"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Compass,
  HandCoins,
  House,
  Leaf,
  Maximize,
  Minimize,
  RefreshCw,
  RotateCw,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import AnimatedNumber from "@/components/AnimatedNumber";
import EquivalentsCycler from "@/components/EquivalentsCycler";
import MessageTicker from "@/components/MessageTicker";
import MobileKiosk from "@/components/MobileKiosk";
import MetricCard from "@/components/MetricCard";
import PowerTrend from "@/components/PowerTrend";
import SafeBoundary from "@/components/SafeBoundary";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFullscreen, useIdleCursor, useKioskMaintenance, useNow } from "@/hooks/useKiosk";
import { useLiveTurbine, useTurbineHistory } from "@/hooks/useTurbineData";
import type { TurbineStatus } from "@/services/aceApi";
import {
  COMMUNITY_FUND_GBP_PER_KWH,
  UK_HOUSEHOLD_KWH_PER_YEAR,
  compassPoint,
  computeCommunityMetrics,
  describeWind,
} from "@/utils/metrics";
import { formatUkDate, formatUkTime } from "@/utils/sun";

const Turbine3D = dynamic(() => import("@/components/Turbine3D"), {
  ssr: false,
  loading: () => <SceneMessage text="Loading the 3D turbine…" />,
});

const STATUS_STYLE: Record<TurbineStatus, { text: string; dot: string; pill: string }> = {
  Generating: { text: "Generating clean power", dot: "bg-emerald-400", pill: "bg-emerald-500/20 ring-emerald-400/40" },
  Idling: { text: "Turning gently in light wind", dot: "bg-sky-400", pill: "bg-sky-500/20 ring-sky-400/40" },
  Standby: { text: "Resting — waiting for wind", dot: "bg-amber-400", pill: "bg-amber-500/20 ring-amber-400/40" },
  Maintenance: { text: "Paused for maintenance", dot: "bg-orange-400", pill: "bg-orange-500/20 ring-orange-400/40" },
  Paused: { text: "Paused for safety checks", dot: "bg-orange-400", pill: "bg-orange-500/20 ring-orange-400/40" },
};

const heading = "text-[clamp(1rem,2.4vh,1.9rem)] font-semibold text-white/85";

function SceneMessage({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-900 text-[clamp(1.2rem,3vh,2.4rem)] font-semibold text-white/70">
      {text}
    </div>
  );
}

function TelemetryChip({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-950/65 px-[2vh] py-[1.4vh] ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-2 text-[clamp(0.85rem,1.9vh,1.5rem)] text-white/70">
        <Icon className="size-[2.4vh]" strokeWidth={2.4} />
        {label}
      </div>
      <div className="text-[clamp(1.6rem,4.4vh,3.6rem)] font-bold leading-tight">{value}</div>
      <div className="text-[clamp(0.85rem,1.9vh,1.5rem)] text-white/70">{sub}</div>
    </div>
  );
}

export default function KioskPage() {
  const now = useNow(1000);
  const { data: live, lastUpdated, reconnecting, connecting } = useLiveTurbine(now?.getTime() ?? 0);
  const history = useTurbineHistory(24);
  const cursorIdle = useIdleCursor(5000);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  useKioskMaintenance();
  // While a visitor explores the 3D model, the telemetry chips step aside.
  const [exploring, setExploring] = useState(false);
  // Phones get a full-screen turbine with the figures floating around it.
  const isMobile = useIsMobile();

  const metrics = useMemo(() => computeCommunityMetrics(live, history), [live, history]);
  const ready = live !== null;
  const status: TurbineStatus = live?.status ?? "Standby";
  const statusStyle = STATUS_STYLE[status];
  const windSpeed = live?.windSpeedMs ?? 0;
  const rpm = live?.rotorSpeedRpm ?? 0;
  const windDirection = live?.windDirectionDeg ?? 225;
  const wind = compassPoint(windDirection);
  const dash = "—";

  if (isMobile) {
    return (
      <MobileKiosk
        now={now}
        live={live}
        metrics={metrics}
        status={status}
        statusStyle={statusStyle}
        connecting={connecting}
        reconnecting={reconnecting}
        lastUpdated={lastUpdated}
      />
    );
  }

  return (
    <main className="flex h-dvh w-screen flex-col gap-[1.6vh] overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-[2vh] text-white">
      {/* Header */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-[1.6vh]">
          <div className="grid size-[7vh] shrink-0 place-items-center rounded-2xl bg-emerald-400 text-slate-950">
            <Wind className="size-[4.4vh]" strokeWidth={2.6} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[clamp(1.5rem,4vh,3.4rem)] font-extrabold leading-tight">
              Lawrence Weston Community Wind Turbine
            </h1>
            <p className="truncate text-[clamp(0.9rem,2.1vh,1.7rem)] text-white/70">
              Owned by the community · Ambition Community Energy &amp; Ambition Lawrence Weston
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-[2vh]">
          <div className={`flex items-center gap-3 rounded-full px-[2vh] py-[1vh] ring-1 ${statusStyle.pill}`}>
            <span className="relative flex size-[1.8vh]">
              {status === "Generating" && (
                <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-70 ${statusStyle.dot}`} />
              )}
              <span className={`relative inline-flex size-full rounded-full ${statusStyle.dot}`} />
            </span>
            <span className="text-[clamp(1rem,2.5vh,2rem)] font-semibold">{ready ? statusStyle.text : "Connecting…"}</span>
          </div>
          <div className="text-right">
            <div className="text-[clamp(1.5rem,4.2vh,3.4rem)] font-bold leading-none tabular-nums">
              {now ? formatUkTime(now) : "--:--"}
            </div>
            <div className="text-[clamp(0.8rem,1.8vh,1.4rem)] text-white/60">{now ? formatUkDate(now) : ""}</div>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
            className={`grid size-[6vh] place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 transition-opacity duration-500 hover:bg-white/20 ${
              cursorIdle ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {isFullscreen ? <Minimize className="size-[3vh]" /> : <Maximize className="size-[3vh]" />}
          </button>
        </div>
      </header>

      {/* Dual-zone body */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[1.6vh] lg:grid-cols-[1.2fr_1fr]">
        {/* Zone 1: 3D digital twin */}
        <section className="relative min-h-[40vh] overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
          <SafeBoundary name="Turbine3D" fallback={<SceneMessage text="Restarting the 3D turbine…" />} retryAfterMs={20_000}>
            <Turbine3D
              className="absolute inset-0"
              rotorSpeedRpm={rpm}
              nacelleYawDeg={live?.nacelleYawDeg ?? windDirection}
              windDirectionDeg={windDirection}
              windSpeedMs={windSpeed}
              status={status}
              hasData={ready}
              onExploringChange={setExploring}
            />
          </SafeBoundary>

          <div className="pointer-events-none absolute left-[2vh] top-[2vh] flex flex-col items-start gap-2">
            <div className="rounded-2xl bg-slate-950/60 px-[2vh] py-[1vh] text-[clamp(0.9rem,2.1vh,1.6rem)] ring-1 ring-white/10 backdrop-blur">
              <span className="font-bold text-emerald-300">Live 3D twin</span> · the blades turn at the real turbine&apos;s speed
            </div>
            {live?.scadaStale && (
              <div className="rounded-2xl bg-amber-500/25 px-[2vh] py-[0.8vh] text-[clamp(0.8rem,1.8vh,1.4rem)] ring-1 ring-amber-400/40">
                Showing the latest turbine reading from {formatUkTime(new Date(live.observedAt))}
              </div>
            )}
          </div>

          {connecting && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[clamp(1.2rem,3vh,2.4rem)] font-semibold text-white/80">
              Connecting to the ACE turbine…
            </div>
          )}

          <div
            className={`pointer-events-none absolute inset-x-[2vh] bottom-[2vh] grid grid-cols-3 gap-[1.4vh] transition-all duration-500 ${
              exploring ? "translate-y-4 opacity-0" : "opacity-100"
            }`}
          >
            <TelemetryChip
              icon={Wind}
              label="Wind speed"
              value={ready ? <><AnimatedNumber value={windSpeed} decimals={1} /> <span className="text-[0.55em] text-white/70">m/s</span></> : dash}
              sub={ready ? describeWind(windSpeed) : dash}
            />
            <TelemetryChip
              icon={RotateCw}
              label="Rotor speed"
              value={ready ? <><AnimatedNumber value={rpm} decimals={1} /> <span className="text-[0.55em] text-white/70">rpm</span></> : dash}
              sub={ready ? (rpm > 0.2 ? `One full turn every ${(60 / rpm).toFixed(1)} s` : "Blades at rest") : dash}
            />
            <TelemetryChip
              icon={Compass}
              label="Wind from the"
              value={
                ready ? (
                  <span className="flex items-center gap-2">
                    <motion.span
                      className="inline-grid"
                      animate={{ rotate: windDirection + 180 }}
                      transition={{ type: "spring", stiffness: 30, damping: 12 }}
                    >
                      <ArrowUp className="size-[0.85em]" strokeWidth={3} />
                    </motion.span>
                    {wind.short}
                  </span>
                ) : (
                  dash
                )
              }
              sub={ready ? `Blowing in from the ${wind.long}` : dash}
            />
          </div>
        </section>

        {/* Zone 2: community value */}
        <SafeBoundary name="Metrics" fallback={<div />} retryAfterMs={10_000}>
          <section className="grid min-h-0 grid-rows-[auto_1fr] gap-[1.6vh]">
            {/* Power hero + 24 h trend */}
            <div className="grid grid-cols-[1fr_0.9fr] gap-[2vh] rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-500/30 via-teal-500/15 to-transparent p-[2.2vh]">
              <div className="flex min-w-0 flex-col justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-[5vh] place-items-center rounded-2xl bg-emerald-400 text-slate-950">
                    <Wind className="size-[3vh]" strokeWidth={2.4} />
                  </span>
                  <h2 className={heading}>Power right now</h2>
                </div>
                <div className="mt-[1vh] flex items-baseline gap-3">
                  <span className="text-[clamp(3rem,10vh,8.5rem)] font-black leading-none tracking-tight">
                    {ready ? <AnimatedNumber value={metrics.powerKw / 1000} decimals={2} /> : dash}
                  </span>
                  <span className="text-[clamp(1.5rem,4.5vh,3.6rem)] font-bold text-emerald-200">MW</span>
                </div>
                <div className="mt-[1.2vh] h-[1.6vh] overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300"
                    initial={{ width: 0 }}
                    animate={{ width: `${metrics.capacityShare * 100}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </div>
                <p className="mt-[0.8vh] text-[clamp(0.9rem,1.9vh,1.5rem)] text-white/70">
                  {ready ? `${Math.round(metrics.capacityShare * 100)}% of its 4.2 MW maximum` : "Maximum 4.2 MW"}
                </p>
              </div>
              <div className="flex min-h-[14vh] min-w-0 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[clamp(0.9rem,2vh,1.6rem)] font-semibold text-white/80">Last 24 hours</h2>
                  {metrics.energy24hKwh !== null && (
                    <span className="text-[clamp(0.9rem,2vh,1.6rem)] font-bold text-emerald-200 tabular-nums">
                      {(metrics.energy24hKwh / 1000).toFixed(1)} MWh
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <PowerTrend history={history} />
                </div>
              </div>
            </div>

            {/* Community metric cards */}
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-[1.6vh]">
              <MetricCard
                icon={House}
                title="Homes powered right now"
                accent="bg-amber-400 text-slate-950"
                caption="average UK homes' worth of electricity"
              >
                {ready ? <AnimatedNumber value={metrics.homesPowered} /> : dash}
              </MetricCard>

              {metrics.fundGbpPerHour !== null ? (
                <MetricCard
                  icon={HandCoins}
                  title="Raising for Lawrence Weston"
                  accent="bg-pink-400 text-slate-950"
                  caption={
                    metrics.fundGbp24h !== null
                      ? `About £${Math.round(metrics.fundGbp24h).toLocaleString("en-GB")} in the last 24 hours*`
                      : "estimated community fund*"
                  }
                >
                  {ready ? <AnimatedNumber value={metrics.fundGbpPerHour} decimals={2} prefix="£" /> : dash}
                  <span className="text-[0.45em] font-bold text-white/70"> an hour</span>
                </MetricCard>
              ) : (
                <MetricCard
                  icon={Zap}
                  title="Generated since switch-on"
                  accent="bg-pink-400 text-slate-950"
                  caption={
                    metrics.lifetimeMwh !== null
                      ? `enough for about ${Math.round((metrics.lifetimeMwh * 1000) / UK_HOUSEHOLD_KWH_PER_YEAR).toLocaleString("en-GB")} homes for a whole year`
                      : "total clean electricity produced"
                  }
                >
                  {ready && metrics.lifetimeMwh !== null ? (
                    <AnimatedNumber value={metrics.lifetimeMwh / 1000} decimals={2} />
                  ) : (
                    dash
                  )}
                  <span className="text-[0.45em] font-bold text-white/70"> GWh</span>
                </MetricCard>
              )}

              <MetricCard
                icon={Leaf}
                title="Carbon dioxide avoided"
                accent="bg-lime-400 text-slate-950"
                caption={
                  metrics.co2Tonnes24h !== null
                    ? `${metrics.co2Tonnes24h.toFixed(1)} tonnes saved in the last 24 hours`
                    : "compared with the UK grid average"
                }
              >
                {ready ? <AnimatedNumber value={metrics.co2KgPerHour} /> : dash}
                <span className="text-[0.45em] font-bold text-white/70"> kg an hour</span>
              </MetricCard>

              <EquivalentsCycler equivalents={metrics.equivalents} ready={ready} />
            </div>
          </section>
        </SafeBoundary>
      </div>

      <MessageTicker />

      <footer className="flex items-center justify-between gap-6 text-[clamp(0.75rem,1.6vh,1.2rem)] text-white/55">
        <span>Live data provided by Ambition Community Energy (ACE) under CC-BY-4.0 | WeDoWind Challenge 5</span>
        <span className="text-right">
          Data DOI 10.5281/zenodo.22662372
          {COMMUNITY_FUND_GBP_PER_KWH !== null && " · *Community fund figures are estimates"}
        </span>
      </footer>

      <AnimatePresence>
        {reconnecting && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-[9vh] right-[2vh] flex items-center gap-3 rounded-full bg-slate-950/85 px-5 py-3 text-[clamp(0.9rem,1.9vh,1.4rem)] ring-1 ring-amber-400/40 backdrop-blur"
          >
            <RefreshCw className="size-[2.2vh] animate-spin text-amber-300" />
            <span>Reconnecting to ACE turbine…</span>
            {lastUpdated && <span className="text-white/55">last update {formatUkTime(new Date(lastUpdated))}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
