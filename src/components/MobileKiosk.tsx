"use client";

/**
 * Phone layout: the live 3D turbine fills the screen and the community data float around it
 * as signs connected to the turbine by leader lines. Tapping the turbine still opens the
 * explorer (the info panel becomes a bottom sheet and the signs step aside).
 */

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Wind } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import MessageTicker from "@/components/MessageTicker";
import SafeBoundary from "@/components/SafeBoundary";
import { buildCallouts } from "@/components/FloatingSigns";
import type { LiveSnapshot, TurbineStatus } from "@/services/aceApi";
import type { CommunityMetrics } from "@/utils/metrics";
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

  const callouts = buildCallouts({ live, metrics });

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
          powerKw={metrics.powerKw}
          status={status}
          hasData={ready}
          snapshot={live}
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
          Live data: Ambition Community Energy (CC-BY-4.0) · DOI 10.5281/zenodo.22662372 · Grid © OpenStreetMap
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
