"use client";

/**
 * Card around every chart: title and legend, then three buttons — reset zoom (while zoomed),
 * ⓘ (what the figure shows and what to conclude from it) and enlarge. The enlarged view opens
 * over the whole screen with the explanation beside the chart.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Info, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ChartExplanation } from "./chartInfo";

interface Props {
  title: ReactNode;
  legend?: ReactNode;
  info?: ChartExplanation;
  zoomed: boolean;
  onResetZoom: () => void;
  /** The plot area (fills the remaining height). */
  children: ReactNode;
  className?: string;
}

const ICON_BTN =
  "grid size-[clamp(1.9rem,3.6vh,2.8rem)] shrink-0 place-items-center rounded-xl text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white";
const ICON = "size-[clamp(0.95rem,1.9vh,1.4rem)]";

export const ZOOM_HINT = "Scroll or pinch to zoom · drag to move · double-click to reset";

function Explanation({ info, className = "" }: { info: ChartExplanation; className?: string }) {
  return (
    <div className={`space-y-[1.2vh] text-[clamp(0.85rem,1.75vh,1.3rem)] leading-snug text-white/80 ${className}`}>
      <section>
        <h4 className="mb-1 font-bold uppercase tracking-wide text-emerald-300 text-[0.8em]">What it shows</h4>
        <p>{info.shows}</p>
      </section>
      <section>
        <h4 className="mb-1 font-bold uppercase tracking-wide text-emerald-300 text-[0.8em]">Why it matters</h4>
        <p>{info.why}</p>
      </section>
      <section>
        <h4 className="mb-1 font-bold uppercase tracking-wide text-emerald-300 text-[0.8em]">What you can learn from it</h4>
        <ul className="list-disc space-y-1 pl-5">
          {info.insights.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ChartFrame({ title, legend, info, zoomed, onResetZoom, children, className = "" }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded && !showInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setExpanded(false);
      setShowInfo(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, showInfo]);

  const header = (
    <figcaption className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-[clamp(0.85rem,1.8vh,1.35rem)] font-semibold text-white/85">{title}</span>
      <span className="flex min-w-0 items-center gap-[1vh]">
        {legend && <span className="flex flex-wrap justify-end gap-x-3 text-[clamp(0.7rem,1.5vh,1.1rem)] text-white/65">{legend}</span>}
        {zoomed && (
          <button type="button" onClick={onResetZoom} className={ICON_BTN} aria-label="Reset zoom" title="Reset zoom">
            <RotateCcw className={ICON} />
          </button>
        )}
        {info && !expanded && (
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className={`${ICON_BTN} ${showInfo ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300 hover:text-slate-950" : ""}`}
            aria-label={showInfo ? "Hide explanation" : "What does this chart show?"}
            aria-expanded={showInfo}
            title="What does this chart show?"
          >
            <Info className={ICON} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setExpanded((v) => !v);
            setShowInfo(false);
          }}
          className={ICON_BTN}
          aria-label={expanded ? "Close the enlarged chart" : "Enlarge the chart"}
          title={expanded ? "Close" : "Enlarge"}
        >
          {expanded ? <Minimize2 className={ICON} /> : <Maximize2 className={ICON} />}
        </button>
      </span>
    </figcaption>
  );

  const card = (
    <figure
      className={`flex min-h-0 flex-col rounded-2xl p-[1.4vh] ring-1 ring-white/10 ${
        expanded ? "h-full bg-slate-900 shadow-2xl" : `bg-white/[0.04] ${className}`
      }`}
    >
      {header}
      <div className={`mt-[0.6vh] flex min-h-0 flex-1 gap-[2vh] ${expanded ? "flex-col lg:flex-row" : ""}`}>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
          {/* Inline explanation: covers the plot until closed. */}
          <AnimatePresence>
            {showInfo && info && !expanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-20 overflow-y-auto rounded-xl bg-slate-950/95 p-[1.4vh] ring-1 ring-white/10"
              >
                <Explanation info={info} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {expanded && (
          <aside className="flex min-h-0 shrink-0 flex-col gap-[1.2vh] overflow-y-auto lg:w-[min(30rem,34%)]">
            {info && <Explanation info={info} />}
            <p className="text-[clamp(0.75rem,1.5vh,1.1rem)] text-white/50">{ZOOM_HINT}</p>
          </aside>
        )}
      </div>
    </figure>
  );

  if (!expanded) return card;
  // Enlarged: rendered over the whole page (outside the tab's scrolling and stacking contexts).
  return (
    <>
      <div className={`rounded-2xl bg-white/[0.02] ring-1 ring-white/5 ${className}`} aria-hidden />
      {createPortal(
        <div
          className="fixed inset-0 z-[80] flex bg-slate-950/80 p-[3vh] text-white backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div className="flex min-h-0 w-full flex-col">{card}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
