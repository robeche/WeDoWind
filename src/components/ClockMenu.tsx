"use client";

/**
 * The clock in the header doubles as the kiosk's demo menu: tap it to start (or stop) the guided
 * tour of the 3D twin and to choose how long the tour stays on each component.
 */

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEMO_CONTROL_ATTR, type DemoMode } from "@/hooks/useKiosk";
import { DEMO_DWELL_OPTIONS } from "@/components/turbine/demoTour";
import { formatUkDate, formatUkTime } from "@/utils/sun";

interface Props {
  now: Date | null;
  demo: DemoMode;
  /** Start the tour from the menu (also brings the live 3D view to the front). */
  onStart: () => void;
  dwell: number | null;
  onDwell: (ms: number | null) => void;
  /** Seconds without input before the tour starts by itself. */
  idleSeconds: number;
  compact?: boolean;
}

export default function ClockMenu({ now, demo, onStart, dwell, onDwell, idleSeconds, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const text = compact
    ? { time: "text-lg", date: "mt-0.5 text-[0.62rem]", panel: "w-[17rem] p-3 text-sm", title: "text-base", chip: "px-2.5 py-1.5 text-sm" }
    : {
        time: "text-[clamp(1.5rem,4.2vh,3.4rem)]",
        date: "text-[clamp(0.8rem,1.8vh,1.4rem)]",
        panel: "w-[clamp(20rem,30vw,30rem)] p-[2.2vh] text-[clamp(0.9rem,1.9vh,1.4rem)]",
        title: "text-[clamp(1.1rem,2.4vh,1.8rem)]",
        chip: "px-[1.4vh] py-[1vh]",
      };

  return (
    <div ref={rootRef} className="pointer-events-auto relative shrink-0" {...{ [DEMO_CONTROL_ATTR]: "" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Clock and guided tour settings"
        className="flex items-center gap-1.5 rounded-xl px-1.5 py-1 text-right transition-colors hover:bg-white/10"
      >
        <span>
          <span className={`block font-bold leading-none tabular-nums ${text.time}`}>{now ? formatUkTime(now) : "--:--"}</span>
          <span className={`block text-white/60 ${text.date}`}>{now ? formatUkDate(now) : ""}</span>
        </span>
        <ChevronDown className={`shrink-0 text-white/50 transition-transform ${open ? "rotate-180" : ""} ${compact ? "size-3.5" : "size-[2.2vh]"}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Guided tour"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className={`absolute right-0 top-full z-[90] mt-2 rounded-2xl bg-slate-900/95 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur ${text.panel}`}
          >
            <h2 className={`font-bold ${text.title}`}>Guided tour</h2>
            <p className="mt-1 text-white/60">
              {demo.active
                ? "Running: it shows every part of the turbine in turn. Touch the screen to stop it."
                : `Walks through every part of the turbine. Starts by itself after ${idleSeconds} s without input.`}
            </p>
            <button
              type="button"
              onClick={() => {
                if (demo.active) demo.stop();
                else onStart();
                setOpen(false);
              }}
              className={`mt-[1.4vh] flex w-full items-center justify-center gap-2 rounded-xl font-bold transition-colors ${
                demo.active ? "bg-white/10 text-white hover:bg-white/20" : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
              } ${text.chip}`}
            >
              {demo.active ? <Square className="size-[1em]" /> : <Play className="size-[1em]" />}
              {demo.active ? "Stop the tour" : "Start the tour now"}
            </button>
            <div className="mt-[1.8vh] font-semibold text-white/80">Time on each component</div>
            <div className="mt-[0.8vh] grid grid-cols-3 gap-[0.8vh]">
              {DEMO_DWELL_OPTIONS.map((o) => {
                const selected = o.ms === dwell;
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onDwell(o.ms)}
                    className={`rounded-xl font-semibold tabular-nums ring-1 transition-colors ${text.chip} ${
                      selected ? "bg-emerald-400 text-slate-950 ring-emerald-300" : "bg-white/5 text-white/85 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-[1vh] text-[0.85em] text-white/50">
              {dwell === null ? "Auto: longer for components with more to read (about 4–9 s)." : "The same time on every component and on the overview."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
